import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { uniq } from "lodash";
import { dirname, join } from "path";
import * as ts from "typescript";
import { z } from "zod";

import { aiChat, openaiJson } from "./ai-chat";
import { archiveDebugJsonFiles, readFilesRecursively } from "./utils";

const SYSTEM = `
You are an expert staff level software engineer.
Working with other staff level engineers on a project.
Do not bikeshed unless asked.
Provide useful responses, make sure to consider when to stay high level and when to dive deep.
`.trim();

const projectContext = {
  rules: [
    "The goal of this project is to use AI to recursively add & improve functionality to itself.",
    "Strict TypeScript is used throughout the codebase.",
    "Type inference is preferred over explicit types when possible.",
    "Prefer concise and expressive code over verbose code, but keep things readable and use comments if necessary.",
    "Never use require, always use import. Any exceptions must be justified with a comment.",
    `Non goals:
- Do not refactor the codebase.
- Do not delete dead code or comments unless it is directly related to the task.
- Keep error handling to a minimum.
- Don't worry about unit tests unless they are explicitly asked for.
- It's fine to have large complex functions during the initial implementation as this is a proof of concept.`,
  ],
  files: {
    dependencies: new Map<string, { fileName?: string; moduleSpecifier: string }[]>(),
  },
};

type ResearchTask =
  | { type: "context"; prompt: string }
  | { type: "filesystem"; files: string[] }
  | { type: "typescript"; files: string[] };

// async function contextResearch(task: ResearchTask & { type: "context" }) {
//   return aiChat("groq", SYSTEM, [
//     {
//       role: "user",
//       content: `${task.prompt}\n\n${Context.map((context) => `<context id="${context.id}" info="${context.info}" note="${context.note}" tags="${context.tags.join(", ")}">\n${context.info}\n</context>`).join("\n\n")}`,
//     },
//   ]);
// }

function xmlFile(obj: { path: string; content: string; research: string }) {
  return {
    path: obj.path,
    content: obj.content,
    toPrompt: ({ showFileContent = false, showResearch = false } = {}) =>
      `
<file path="${obj.path}" ${showFileContent ? "" : 'content-hidden="true"'}>
${showFileContent ? `<content>\n${obj.content}\n</content>\n` : ""}
${showResearch ? `<research>\n${obj.research}\n</research>\n` : ""}
</file>`.trim(),
  };
}

function xmlFilesystemResearch({ files, research }: { files: ReturnType<typeof xmlFile>[]; research: string }) {
  return {
    files,
    research,
    toPrompt: ({ showFileContent = false, showResearch = false } = {}) =>
      `
<report>
<files>
${files.map((f) => f.toPrompt({ showFileContent, showResearch })).join("\n\n")}
</files>
${showResearch ? `<research>\n${research}\n</research>\n` : ""}
</report>
      `.trim(),
  };
}

async function filesystemResearch(task: ResearchTask & { type: "filesystem" }) {
  console.log("filesystemResearch");
  const rawFiles = task.files.flatMap((f) =>
    statSync(f).isDirectory() ? readFilesRecursively(f) : [{ path: f, content: readFileSync(f, "utf-8") }],
  );
  const files: ReturnType<typeof xmlFile>[] = [];
  for (const f of rawFiles) {
    const research = await aiChat("groq", SYSTEM, [
      {
        role: "user",
        content: `
Could you please provide the following information:
- A brief description of the given file's purpose and contents.
- An outline and a brief description for every export.

<file path="${f.path}">
${f.content}
</file>
  `.trim(),
      },
    ]);
    files.push(xmlFile({ path: f.path, content: f.content, research }));
  }

  // todo use dependencies to read a few related files at a time instead of all at once
  const research = await aiChat("groq", SYSTEM, [
    {
      role: "user",
      content: `
Could you please provide the following information:
- A summary of the coding conventions used in the codebase.
- An overview of the high-level structure, including key components and their interactions.
- Any notable design patterns or architectural decisions evident in the codebase.
- Any best practices or common patterns you can identify from the provided files.

<files>
${files.map((f) => f.toPrompt({ showFileContent: true })).join("\n\n")}
</files>
`.trim(),
    },
  ]);
  return xmlFilesystemResearch({ files, research });
}

async function typescriptResearch(task: ResearchTask & { type: "typescript" }) {
  console.log("typescriptResearch");
  const configPaths = uniq(
    task.files
      .map((f) => ts.findConfigFile(f, ts.sys.fileExists, "tsconfig.json"))
      .filter(<T>(f: T | undefined): f is T => f !== undefined),
  );
  const programs = configPaths
    .map((p) => {
      const config = ts.readConfigFile(p, ts.sys.readFile);
      return ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(p));
    })
    .map((config) => ts.createProgram(config.fileNames, config.options));

  const dependencies: Map<string, { fileName?: string; moduleSpecifier: string }[]> = new Map();
  for (const program of programs) {
    program.getSourceFiles().forEach((sourceFile) => {
      if (sourceFile.isDeclarationFile) return;

      const fileName = sourceFile.fileName;
      const imports: { fileName?: string; moduleSpecifier: string }[] = [];

      ts.forEachChild(sourceFile, (node) => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
          const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
          const resolver = ts.resolveModuleName(moduleSpecifier, fileName, program.getCompilerOptions(), ts.sys);
          const resolvedFileName = resolver?.resolvedModule?.resolvedFileName;
          if (!resolvedFileName && (moduleSpecifier.startsWith(".") || moduleSpecifier.startsWith("/")))
            throw new Error(`Could not resolve module ${moduleSpecifier} in ${fileName}`);
          imports.push({ fileName: resolvedFileName, moduleSpecifier });
        }
      });

      dependencies.set(fileName, imports);
    });
  }
  return dependencies;
}

// async function research(task: ResearchTask) {
//   switch (task.type) {
//     case "context":
//       throw new Error("Not implemented");
//     // return contextResearch(task as ResearchTask & { type: "context" });
//     case "filesystem":
//       return filesystemResearch(task as ResearchTask & { type: "filesystem" });
//     case "typescript":
//       return typescriptResearch(task as ResearchTask & { type: "typescript" });
//     default:
//       task satisfies never;
//       throw new Error("Invalid task type");
//   }
// }

async function plan({ context, goal }: { context: string; goal: string }) {
  console.log("plan", goal);
  return aiChat("opus", SYSTEM, [
    {
      role: "user",
      content: `
${context}

Please create a plan for the following goal: ${goal}
The plan should include a list of steps to achieve the goal, as well as any potential obstacles or challenges that may arise.
Call out specific areas of the codebase that may need to be modified or extended to support the new functionality, and provide a high-level overview of the changes that will be required.
If using short file names, please include a legend at the top of the file with the absolute path to the file.
               `.trim(),
    },
  ]);
}

async function execute({ prompt }: { prompt: string }) {
  console.log("execute");
  return aiChat("gpt4o", SYSTEM, [
    {
      role: "user",
      content: prompt,
    },
  ]);
}

async function iterate() {
  const goal = "Move AI Chat helper functions to a separate file.";

  // research
  const typescriptResult = await typescriptResearch({
    type: "typescript",
    files: [join(__dirname, "./meta-nova-dev.ts")],
  });
  const researchResult = await filesystemResearch({
    type: "filesystem",
    files: [...typescriptResult.keys()],
  });
  writeFileSync("debug/research.json", researchResult.toPrompt({ showFileContent: true, showResearch: true }));

  // planning
  const planResult = await plan({
    context: `
  <context>
  ${projectContext.rules.join("\n")}
  </context>
  ${researchResult.toPrompt({ showResearch: true })}
  `.trim(),
    goal,
  });
  writeFileSync("debug/plan.json", planResult);

  // execution
  const executeResult = await execute({
    prompt: `
<context>
${projectContext.rules.join("\n")}
</context>
<research>
${researchResult.toPrompt({ showResearch: true, showFileContent: true })}
</research>
<plan>
${planResult}
</plan>

Please suggest changes to the provided files based on the plan.
Suggestions may either be snippets or full files, it should be clear enough for a junior engineer to understand and apply.
Prefer snippets unless the file is small or the change is very large.
Make sure to be very clear about which file is changing and what the change is.
Please include a legend at the top of the file with the absolute path to the files you are changing.
Suggest adding imports in distinct, standalone snippets from the code changes.
If creating a new file, please provide the full file content.
      `.trim(),
  });
  writeFileSync("debug/execute.json", executeResult);

  const ChangeSetSchema = z.object({
    generalNoteList: z
      .string({
        description:
          "General notes for the project, such as packages to install. This should not be used for file changes.",
      })
      .array()
      .optional(),
    filesToChange: z.array(
      z.object({
        absolutePathIncludingFileName: z.string(),
        fullStepsWithEverything_GPT_I_AM_SERIOUS_YOU_SHOULD_COPY_EVERYTHING_FOR_THIS_FILE_INCLUDING_STEP_NOTES_AND_TITLE_AND_ONLY_ONE_STEP_PER_ARRAY_ITEM:
          z.array(z.string()),
      }),
    ),
  });
  type ChangeSet = z.infer<typeof ChangeSetSchema>;
  const changeSet = await openaiJson(
    ChangeSetSchema,
    SYSTEM,
    `
I have a document detailing changes to a project. Please transform the information into a JSON format with the following structure:

1.	General notes for the project, such as packages to install.
2.	A list of files to change, each containing a list of changes. Only include files that have changes.

Example:
${JSON.stringify({
  generalNoteList: ["This is a note"],
  filesToChange: [
    {
      absolutePathIncludingFileName: "/root/project/src/file.ts",
      fullStepsWithEverything_GPT_I_AM_SERIOUS_YOU_SHOULD_COPY_EVERYTHING_FOR_THIS_FILE_INCLUDING_STEP_NOTES_AND_TITLE_AND_ONLY_ONE_STEP_PER_ARRAY_ITEM:
        [
          "#### Modify `aiChat` Function\nUpdate the `aiChat` function to include caching.\n\n```typescript\n// utils.ts\nfunction generateCacheKey(model: string, system: string, messages: { role: \"user\" | \"assistant\"; content: string }[]): string {\n  const hash = createHash('sha256');\n  hash.update(model + system + JSON.stringify(messages));\n  return hash.digest('hex');\n}\n\nasync function aiChat(\n  model: 'groq' | 'gpt4o' | 'opus' | 'gemini' | 'geminiFlash',\n  system: string,\n  messages: { role: 'user' | 'assistant'; content: string }[],\n): Promise<string> {\n  const cacheKey = generateCacheKey(model, system, messages);\n  const cachePath = join(CACHE_DIR, `${cacheKey}.json`);\n\n  if (existsSync(cachePath)) {\n    const cachedData = JSON.parse(readFileSync(cachePath, 'utf-8'));\n    // Assuming there is a `timestamp` attribute to validate freshness\n    if (Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) { // 24 hours expiration\n      return cachedData.response;\n    }\n  }\n\n  let response: string;\n  switch (model) {\n    case 'groq':\n      response = await groqChat(system, messages);\n      break;\n    case 'gpt4o':\n      response = await openaiChat(system, messages);\n      break;\n    case 'opus':\n      response = await claudeChat(system, messages);\n      break;\n    case 'gemini':\n      response = await geminiChat(gemini, system, messages);\n      break;\n    case 'geminiFlash':\n      response = await geminiChat(geminiFlash, system, messages);\n      break;\n    default:\n      throw new Error('Invalid model name');\n  }\n\n  writeFileSync(\n    cachePath, \n    JSON.stringify({ response, timestamp: Date.now() }, null, 2)\n  );\n\n  return response;\n}\n```",
        ],
    },
  ],
} satisfies ChangeSet)}

Here's the document content:
${executeResult}
    `.trim(),
  );
  writeFileSync("debug/result.json", JSON.stringify(changeSet, null, 2));

  console.log(changeSet.generalNoteList?.join("\n") || "");
  for (const file of changeSet.filesToChange) {
    const output = await aiChat("groq", SYSTEM, [
      {
        role: "user",
        content: `
<context>
${projectContext.rules.join("\n")}
</context>

Please take the following change set and output the final file, if it looks like the changes are a full file overwrite, output just the changes.
Your response will directly overwrite the file.
<file path="${file.absolutePathIncludingFileName}">
${existsSync(file.absolutePathIncludingFileName) ? readFileSync(file.absolutePathIncludingFileName) : ""}
</file>
<changes>
${file.fullStepsWithEverything_GPT_I_AM_SERIOUS_YOU_SHOULD_COPY_EVERYTHING_FOR_THIS_FILE_INCLUDING_STEP_NOTES_AND_TITLE_AND_ONLY_ONE_STEP_PER_ARRAY_ITEM.map((change) => `<change>${change}</change>`).join("\n")}
</changes>
        `.trim(),
      },
    ]);

    writeFileSync(file.absolutePathIncludingFileName, output);
  }

  archiveDebugJsonFiles("debug");
}
iterate().catch(console.error);
