import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

import { aiChat, claudeJson, getDb, openaiJson, readFilesRecursively } from "./utils";

const SYSTEM = `
You are an expert staff level software engineer.
Working with other staff level engineers on a project.
Do not bikeshed unless asked.
Provide useful responses, make sure to consider when to stay high level and when to dive deep.
`.trim();

const Context = [
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
].map((info, index) => ({ id: `${index}`, info, note: "", tags: [] }));

const DbSchema = z.object({
  context: z
    .object({
      id: z.string(),
      info: z.string(),
      note: z.string(),
      tags: z.array(z.string()),
    })
    .array(),
});
// const db = getDb("meta-nova-dev.json", DbSchema, { context: [] });

type ResearchTask =
  | {
      type: "context"; // | "web" | "typescript-lib";
      prompt: string;
    }
  | {
      type: "filesystem";
      prompt: string;
      files: { path: string; recursive?: boolean }[];
    }
  | {
      type: "typescript";
      prompt: string;
      files: string[];
    };

async function contextResearch(task: ResearchTask & { type: "context" }) {
  return aiChat("groq", SYSTEM, [
    {
      role: "user",
      content: `${task.prompt}\n\n${Context.map((context) => `<context id="${context.id}" info="${context.info}" note="${context.note}" tags="${context.tags.join(", ")}">\n${context.info}\n</context>`).join("\n\n")}`,
    },
  ]);
}

async function filesystemResearch(task: ResearchTask & { type: "filesystem" }) {
  let files: string[] = [];
  for (const file of task.files) {
    if (file.recursive) {
      const recursiveFiles = readFilesRecursively(file.path);
      files = files.concat(recursiveFiles.map((f) => `<file path="${f.path}">\n${f.content}\n</file>`));
    } else {
      const content = readFileSync(file.path, "utf-8");
      files.push(`<file path="${file.path}">\n${content}\n</file>`);
    }
  }

  const result = await aiChat("groq", SYSTEM, [
    {
      role: "user",
      content: `${task.prompt}\n\n${files.join("\n\n")}`,
    },
  ]);
  return `<filesystem>\n${files.join("\n\n")}\n</filesystem>\n\n<research>\n${result}\n</research>`;
}

async function typescriptResearch(task: ResearchTask & { type: "typescript" }) {
  const { parse } = require("@typescript-eslint/typescript-estree");
  const files = task.files.map((file) => ({
    path: file,
    content: readFileSync(file, "utf-8"),
  }));
  const results: string[] = [];

  for (const file of files) {
    const ast = parse(file.content, {
      loc: true,
      range: true,
    });
    // TODO: Process AST and extract relevant information based on task.prompt
    results.push(`<file path="${file.path}">
${JSON.stringify(ast, null, 2)}
</file>`);
  }

  const result = await aiChat("groq", SYSTEM, [
    {
      role: "user",
      content: `${task.prompt}

${results.join("\n\n")}`,
    },
  ]);

  return `<typescript-research>
${results.join("\n\n")}
</typescript-research>

<research>
${result}
</research>`;
}

async function research(task: ResearchTask) {
  switch (task.type) {
    case "context":
      return contextResearch(task as ResearchTask & { type: "context" });
    case "filesystem":
      return filesystemResearch(task as ResearchTask & { type: "filesystem" });
    case "typescript":
      return typescriptResearch(task as ResearchTask & { type: "typescript" });
    default:
      task satisfies never;
      throw new Error("Invalid task type");
  }
}

async function plan({ prompt }: { prompt: string }) {
  return aiChat("opus", SYSTEM, [
    {
      role: "user",
      content: prompt,
    },
  ]);
}

async function execute({ prompt }: { prompt: string }) {
  return aiChat("gpt4o", SYSTEM, [
    {
      role: "user",
      content: prompt,
    },
  ]);
}

async function iterate() {
  const goal =
    "Add a new research type called 'typescript' which uses typescript's programmatic api to explore the codebase.";

  // research
  const researchResult = await research({
    type: "filesystem",
    prompt: `
Could you please provide the following information:

A summary of the coding conventions used in the codebase.
An overview of the high-level structure, including key components and their interactions.
Any notable design patterns or architectural decisions evident in the codebase.
Any best practices or common patterns you can identify from the provided files.
      `.trim(),
    files: [{ path: join(__dirname, "./meta-nova-dev.ts") }, { path: join(__dirname, "./utils.ts") }],
  });
  writeFileSync("research.json", researchResult);

  // planning
  const planResult = await plan({
    prompt: `
<context>
${Context.map((c) => c.info).join("\n")}
</context>
<research>
${researchResult}
</research>

Please create a plan for the following goal: ${goal}
The plan should include a list of steps to achieve the goal, as well as any potential obstacles or challenges that may arise.
Call out specific areas of the codebase that may need to be modified or extended to support the new functionality, and provide a high-level overview of the changes that will be required.
        `.trim(),
  });
  writeFileSync("plan.json", planResult);

  // execution
  const executeResult = await execute({
    prompt: `
<context>
${Context.map((c) => c.info).join("\n")}
</context>
<research>
${researchResult}
</research>
<plan>
${planResult}
</plan>

Please suggest changes to the provided files based on the plan.
Suggestions may either be snippets or full files, it should be clear enough for a junior engineer to understand and apply.
Prefer snippets unless the file is small or the change is very large.
Make sure to be very clear about which file is changing and what the change is.
If using short file names, please include a legend at the top of the file with the absolute path to the file.
Suggest adding imports in distinct, standalone snippets from the code changes.
      `.trim(),
  });
  writeFileSync("execute.json", executeResult);

  const changeSet = await openaiJson(
    z.object({
      generalNoteList: z
        .string({
          description:
            "General notes for the project, such as packages to install. This should not be used for file changes.",
        })
        .array()
        .optional(),
      filesToChange: z.array(
        z.object({
          file: z.string(),
          path: z.string(),
          fullStepsWithEverything_GPT_I_AM_SERIOUS_YOU_SHOULD_COPY_EVERYTHING_FOR_THIS_FILE_INCLUDING_STEP_NOTES_AND_TITLE_AND_ONLY_ONE_STEP_PER_ARRAY_ITEM:
            z.array(z.string()),
        }),
      ),
    }),
    SYSTEM,
    `
I have a document detailing changes to a project. Please transform the information into a JSON format with the following structure:

1.	General notes for the project, such as packages to install.
2.	A list of files to change, each containing a list of changes. Only include files that have changes.

Here's the document content:
${executeResult}
    `.trim(),
  );
  writeFileSync("result.json", JSON.stringify(changeSet, null, 2));

  console.log(changeSet.generalNoteList?.join("\n") || "");
  for (const file of changeSet.filesToChange) {
    const output = await aiChat("groq", SYSTEM, [
      {
        role: "user",
        content: `
<context>
${Context.map((c) => c.info).join("\n")}
</context>

Please take the following change set and output the final file, if it looks like the changes are a full file overwrite, output just the changes.
Your response will directly overwrite the file.
<file path="${file.path}">
${readFileSync(file.path)}
</file>
<changes>
${file.fullStepsWithEverything_GPT_I_AM_SERIOUS_YOU_SHOULD_COPY_EVERYTHING_FOR_THIS_FILE_INCLUDING_STEP_NOTES_AND_TITLE_AND_ONLY_ONE_STEP_PER_ARRAY_ITEM.map((change) => `<change>${change}</change>`).join("\n")}
</changes>
        `.trim(),
      },
    ]);
    writeFileSync(file.path, output);
  }

  // verification
}
iterate().catch(console.error);
