import ReactDiffViewer from "react-diff-viewer";
import { toast } from "react-toastify";
import { isDefined } from "@repo/shared";
import ignore, { Ignore } from "ignore";
import llamaTokenizer from "llama-tokenizer-js";
import { uniq } from "lodash";
import pLimit from "p-limit";
import { z } from "zod";

import { Well } from "../../components/base/Well";
import { generateCacheKey } from "../hash";
import { createNodeDef, NodeRunnerContext } from "./node-types";
import { orRef } from "./ref-types";
import { getDepTree } from "./ts-utils";

const ResearchedFile = z.object({
  path: z.string(),
  content: z.string(),
  research: z.string(),
});
type ResearchedFile = z.infer<typeof ResearchedFile>;

const ResearchedFileSystem = z.object({
  files: z.array(ResearchedFile),
  research: z.string(),
});
type ResearchedFileSystem = z.infer<typeof ResearchedFileSystem>;

function checkIgnores(ignores: { dir: string; ignore: Ignore }[], path: string) {
  for (const { dir, ignore } of ignores) {
    if (path.startsWith(dir)) {
      const relativePath = path.slice(dir.length);
      if (ignore.ignores(relativePath)) return true;
    } else {
      console.error("Path does not start with dir", path, dir);
    }
  }
  return false;
}

async function readFilesRecursively(
  nrc: NodeRunnerContext,
  path: string, // ends with /
  extensions: string[],
  ignores: { dir: string; ignore: Ignore }[] = [],
): Promise<{ path: string; content: string }[]> {
  if (checkIgnores(ignores, path)) return [];

  const limit = pLimit(5);

  const file = await nrc.readFile(path);
  // file is unexpected here, since directories are supposed to be provided to this function
  if (file.type === "not-found" || file.type === "file") return [];

  const newIgnores = [...ignores];
  const gitignore = await nrc.readFile(`${path}.gitignore`);
  if (gitignore.type === "file") {
    newIgnores.push({ dir: path, ignore: ignore().add(gitignore.content) });
  }

  const result: { path: string; content: string }[] = [];

  // Collect all file reading promises, but limit concurrency
  const filePromises = file.files.map((f) =>
    limit(async () => {
      if (f === ".git") return;

      const p = `${path}${f}`;
      if (checkIgnores(newIgnores, p)) return;

      const file = await nrc.readFile(p);
      if (file.type === "not-found") return;
      if (file.type === "file") {
        if (extensions.some((ext) => p.endsWith(ext)) && file.content.length < 1e6) {
          result.push({ path: p, content: file.content });
        }
      } else {
        result.push(...(await readFilesRecursively(nrc, `${p}/`, extensions, newIgnores)));
      }
    }),
  );
  await Promise.all(filePromises);

  return result;
}

function xmlFilePrompt(
  file: ResearchedFile,
  { showFileContent = false as boolean | ((path: string) => boolean), showResearch = false } = {},
) {
  const showFileContentForPath = typeof showFileContent === "function" ? showFileContent(file.path) : showFileContent;
  return `<file path="${file.path}" ${showFileContentForPath ? "" : 'content-hidden="true"'}>
${showFileContentForPath ? `<content>\n${file.content}\n</content>\n` : ""}
${showResearch ? `<research>\n${file.research}\n</research>\n` : ""}
</file>`.trim();
}

function xmlFileSystemResearch(
  { files, research }: { files: ResearchedFile[]; research: string },
  {
    showFileContent = false as boolean | ((path: string) => boolean),
    showResearch = false,
    filterFiles = (_path: string) => true as boolean,
  } = {},
) {
  return `
<report>
<files>
${files
  .filter((f) => filterFiles(f.path))
  .map((f) => xmlFilePrompt(f, { showFileContent, showResearch }))
  .join("\n\n")}
</files>
${showResearch ? `<research>\n${research}\n</research>\n` : ""}
</report>
        `.trim();
}

async function projectAnalysis(nrc: NodeRunnerContext): Promise<ResearchedFileSystem> {
  // todo lm_ec44d16eee restore ts deps
  // const { result: typescriptResult } = await nrc.getOrAddDependencyForResult({
  //   type: NNodeType.TypescriptDepAnalysis,
  // });
  // const pendingFiles = [...Object.keys(typescriptResult)];
  // const dependencies = typescriptResult;

  const rawFiles = await readFilesRecursively(nrc, "/", nrc.projectContext.extensions);
  const limit = pLimit(5);
  const researchPromises = rawFiles.map((f) =>
    limit(async (): Promise<ResearchedFile> => {
      console.log("filesystemResearch file", f.path);
      const research = await nrc.aiChat("geminiFlash", [
        {
          role: "user",
          content: `
Could you please provide the following information:
- A description of the given file's purpose and contents.
- An outline and description for every export.

<file path="${f.path}">
${f.content}
</file>
        `.trim(),
        },
      ]);
      return { path: f.path, content: f.content, research };
    }),
  );
  const files = await Promise.all(researchPromises);
  const fileHashes = await Promise.all(
    files.map(async (f) => ({ path: f.path, hash: await generateCacheKey({ content: f.content }) })),
  );

  const cachedProjectAnalysisSchema = z.object({
    research: z.string(),
    fileHashes: z.array(z.object({ path: z.string(), hash: z.string() })),
    timestamp: z.number(),
  });
  const cachedProjectAnalysis = await nrc.getCache("project-analysis", cachedProjectAnalysisSchema);
  if (cachedProjectAnalysis) {
    const { fileHashes: cachedFileHashes } = cachedProjectAnalysis;
    const changedFileCount = fileHashes.filter(
      (f) => !cachedFileHashes.some((c) => f.path === c.path && f.hash === c.hash),
    ).length;
    const delFileCount = cachedFileHashes.filter((c) => !fileHashes.some((f) => f.path === c.path)).length;

    console.log("Cached project analysis delta", { changedFileCount, delFileCount });

    if (changedFileCount + delFileCount < 20) {
      console.log("Using cached project analysis");
      return { files, research: cachedProjectAnalysis.research };
    } else {
      console.log("Revalidating project analysis");
    }
  }

  function constructBatchPrompt(batch: ResearchedFile[]) {
    return `
Could you please provide the following information:
- A summary of the coding conventions used in the codebase.
- An overview of the high-level structure, including key components and their interactions.
- Any notable design patterns or architectural decisions evident in the codebase.
- Any best practices or common patterns you can identify from the provided files.

<files>
${batch.map((f) => xmlFilePrompt(f, { showFileContent: true })).join("\n\n")}
</files>
`.trim();
  }

  let research;
  const totalBatchPrompt = constructBatchPrompt(files);
  const modelLimit = { groq: 8192, geminiFlash: 1e6 };
  const model = "geminiFlash" as const;
  if (llamaTokenizer.encode(totalBatchPrompt).length < modelLimit[model] * 0.6) {
    research = await nrc.aiChat(model, [{ role: "user", content: constructBatchPrompt(files) }]);
  } else {
    console.log("Batching research");
    const seen = new Set<string>();
    const batchTokenThreshold = modelLimit[model] * 0.4;

    const docs = [];
    let batch: ResearchedFile[] = [];
    let priority: typeof stack = []; // files related to the current batch
    const stack = [...files];
    while (stack.length > 0) {
      const f = priority.length > 0 ? priority.shift()! : stack.shift()!;
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      batch.push(f);

      // prioritize files that are dependencies of the current batch
      // const deps = dependencies[f.path];
      // if (deps) priority.push(...stack.filter((d) => deps.some((dep) => dep.fileName === d.path)));

      // if the batch is too large, send it to the AI
      const batchPrompt = constructBatchPrompt(batch);
      if (batchPrompt.length > batchTokenThreshold) {
        console.log(
          "Running batch of",
          batch.length,
          "files",
          batch.map((f) => f.path),
        );
        docs.push(await nrc.aiChat(model, [{ role: "user", content: batchPrompt }]));
        batch = [];
        priority = [];
      }
    }
    if (batch.length > 0) docs.push(await nrc.aiChat(model, [{ role: "user", content: constructBatchPrompt(batch) }]));

    research = await nrc.aiChat(model, [
      {
        role: "user",
        content: `
The following are the research results for a codebase, remove repeated information and consolidate the information into a single document.

${docs.map((doc) => `<doc>${doc}</doc>`).join("\n")}
`.trim(),
      },
    ]);
  }

  await nrc.setCache("project-analysis", { research, fileHashes, timestamp: Date.now() } satisfies z.infer<
    typeof cachedProjectAnalysisSchema
  >);
  return { files, research };
}

export const OutputNNode = createNodeDef(
  "output",
  z.object({ description: z.string(), value: orRef(z.unknown()) }),
  z.object({}),
  {
    run: async (value) => {
      console.log("[OutputNode] ", value.description, value.value);
      toast.info(`[OutputNode] ${value.value}`, { autoClose: false });
      return {};
    },
    renderInputs: (v) => <Well title={v.description}>{JSON.stringify(v.value, null, 2)}</Well>,
    renderResult: () => null,
  },
);

export const ProjectAnalysisNNode = createNodeDef(
  "project-analysis",
  z.object({}),
  z.object({ result: ResearchedFileSystem }),
  {
    run: async (value, nrc) => ({ result: await projectAnalysis(nrc) }),
    renderInputs: () => null,
    renderResult: (res) => (
      <>
        <Well title="Research" markdown>
          {res.result.research}
        </Well>
        <Well title="Files" markdown>
          {/* todo maybe allow looking at individual files? */}
          {`${res.result.files.length} source files processed`}
        </Well>
      </>
    ),
  },
);

export const RelevantFileAnalysisNNode = createNodeDef(
  "relevant-file-analysis",
  z.object({ goal: orRef(z.string()) }),
  z.object({ result: z.string(), files: z.array(z.string()) }),
  {
    run: async (value, nrc) => {
      // todo lm_ec44d16eee restore ts deps
      // const { result: typescriptResult } = await nrc.getOrAddDependencyForResult({
      //   type: NNodeType.TypescriptDepAnalysis,
      // });
      const typescriptResult = {} as Record<string, { fileName: string }[]>;
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {}, true);

      const rawRelevantFiles = await nrc.aiChat("geminiFlash", [
        {
          role: "user",
          content: `
${xmlFileSystemResearch(researchResult, { showResearch: true })}

Based on the research, please identify the relevant files for the goal.
The relevant files are the ones that are most likely to be impacted by the goal and may need to be modified or extended to support the new functionality.
Related files may also include files that would be useful to reference or provide context for the changes.
Goal: ${value.goal}
`.trim(),
        },
      ]);

      const RelevantFilesSchema = z.object({ files: z.array(z.string()) });
      const directRelevantFiles = await nrc.aiJson(
        RelevantFilesSchema,
        `Extract all the absolute paths for the relevant files from the following:\n\n${rawRelevantFiles}`,
      );
      const relevantFiles = uniq(
        directRelevantFiles.files.flatMap((f) => [
          f,
          ...(typescriptResult[f]?.map((d) => d.fileName).filter(isDefined) || []),
        ]),
      );

      return { result: rawRelevantFiles, files: relevantFiles };
    },
    renderInputs: (v) => <Well title="Goal">{v.goal}</Well>,
    renderResult: (res) => (
      <>
        <Well title="Result" markdown>
          {res.result}
        </Well>
        <Well title="Files">{res.files.join("\n")}</Well>
      </>
    ),
  },
);

export const TypescriptDepAnalysisNNode = createNodeDef(
  "typescript-dep-analysis",
  z.object({}),
  z.object({ result: z.record(z.array(z.object({ fileName: z.string().optional(), moduleSpecifier: z.string() }))) }),
  {
    run: async (value, nrc) => {
      // todo lm_ec44d16eee restore ts deps
      // const result = getDepTree(nrc.projectContext.);
      // console.log("[TypescriptDepAnalysis] ", result);
      return { result: {} };
    },
    renderInputs: () => null,
    renderResult: () => null, // todo lm_ec44d16eee restore ts deps
  },
);

export const PlanNNode = createNodeDef(
  "plan",
  z.object({ goal: orRef(z.string()) }),
  z.object({ result: z.string() }),
  {
    run: async (value, nrc) => {
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {});
      const {
        result: relevantFilesAnalysis,
        files: relevantFiles,
        createNodeRef: createRelevantFilesRef,
      } = await nrc.getOrAddDependencyForResult(
        RelevantFileAnalysisNNode,
        { goal: nrc.createNodeRef({ type: "value", path: "goal", schema: "string" }) },
        true,
      );
      const res = await nrc.aiChat("gemini", [
        {
          role: "user",
          content: `
<context>
${nrc.projectContext.rules.join("\n")}
</context>
<relevantFilesAnalysis>
${relevantFilesAnalysis}
</relevantFilesAnalysis>
${xmlFileSystemResearch(researchResult, { showResearch: true, showFileContent: (f) => relevantFiles.includes(f) })}

Please create a plan for the following goal: ${value.goal}
The plan should include a list of steps to achieve the goal, as well as any potential obstacles or challenges that may arise.
Call out specific areas of the codebase that may need to be modified or extended to support the new functionality, and provide a high-level overview of the changes that will be required.
If using short file names, please include a legend at the top of the file with the absolute path to the file.
Contents for most files are omitted, but please comment on which files would be helpful to provide to improve the plan.
                     `.trim(),
        },
      ]);

      nrc.addDependantNode(ExecuteNNode, {
        instructions: nrc.createNodeRef({ type: "result", path: "result", schema: "string" }),
        relevantFiles: createRelevantFilesRef({ type: "result", path: "files", schema: "string[]" }),
      });
      return { result: res };
    },
    renderInputs: (v) => <Well title="Goal">{v.goal}</Well>,
    renderResult: (res) => (
      <Well title="Result" markdown>
        {res.result}
      </Well>
    ),
  },
);

export const ExecuteNNode = createNodeDef(
  "execute",
  z.object({ instructions: orRef(z.string()), relevantFiles: orRef(z.array(z.string())) }),
  z.object({ result: z.string() }),
  {
    run: async (value, nrc) => {
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {});
      const res = await nrc.aiChat("gpt4o", [
        {
          role: "user",
          content: `
<context>
${nrc.projectContext.rules.join("\n")}
</context>
${xmlFileSystemResearch(researchResult, { showResearch: true, showFileContent: true, filterFiles: (f) => value.relevantFiles.includes(f) })}
<instructions>
${value.instructions}
</instructions>

Please suggest changes to the provided files based on the plan.
Suggestions may either be snippets or full files, it should be clear enough for a junior engineer to understand and apply.
Prefer snippets unless the file is small or the change is very large.
Make sure to be very clear about which file is changing and what the change is.
Please include a legend at the top of the file with the absolute path to the files you are changing. (Example: /root/project/src/file.ts)
Suggest adding imports in distinct, standalone snippets from the code changes.
If creating a new file, please provide the full file content.`.trim(),
        },
      ]);

      nrc.addDependantNode(CreateChangeSetNNode, {
        rawChangeSet: nrc.createNodeRef({ type: "result", path: "result", schema: "string" }),
      });
      return { result: res };
    },
    renderInputs: (v) => (
      <>
        <Well title="Instructions" markdown>
          {v.instructions}
        </Well>
        <Well title="Relevant Files">{v.relevantFiles.map((file) => file).join("\n") || ""}</Well>
      </>
    ),
    renderResult: (res) => (
      <Well title="Result" markdown>
        {res.result}
      </Well>
    ),
  },
);

const ChangeSet = z.object({
  generalNoteList: z
    .string({
      description:
        "General notes for the project, such as packages to install. This should not be used for file changes.",
    })
    .array()
    .optional(),
  filesToChange: z.array(z.object({ absolutePathIncludingFileName: z.string(), steps: z.array(z.string()) })),
});
type ChangeSet = z.infer<typeof ChangeSet>;

export const CreateChangeSetNNode = createNodeDef(
  "create-change-set",
  z.object({ rawChangeSet: orRef(z.string()) }),
  z.object({ result: ChangeSet }),
  {
    run: async (value, nrc) => {
      const changeSet = await nrc.aiJson(
        ChangeSet,
        `
I have a document detailing changes to a project. Please transform the information into a JSON format with the following structure:

1.	General notes for the project, such as packages to install.
2.	A list of all files to change, each containing a list of changes. Only include files that have changes.

Example:
${JSON.stringify({
  generalNoteList: ["This is a general note"],
  filesToChange: [
    {
      absolutePathIncludingFileName: "/root/project/src/file.ts",
      steps: [
        "#### Modify `aiChat` Function\nUpdate the `aiChat` function to include caching.\n\n```typescript\n// utils.ts\nfunction generateCacheKey(model: string, system: string, messages: { role: \"user\" | \"assistant\"; content: string }[]): string {\n  const hash = createHash('sha256');\n  hash.update(model + system + JSON.stringify(messages));\n  return hash.digest('hex');\n}\n\nasync function aiChat(\n  model: 'groq' | 'gpt4o' | 'opus' | 'gemini' | 'geminiFlash',\n  system: string,\n  messages: { role: 'user' | 'assistant'; content: string }[],\n): Promise<string> {\n  const cacheKey = generateCacheKey(model, system, messages);\n  const cachePath = join(CACHE_DIR, `${cacheKey}.json`);\n\n  if (existsSync(cachePath)) {\n    const cachedData = JSON.parse(readFileSync(cachePath, 'utf-8'));\n    // Assuming there is a `timestamp` attribute to validate freshness\n    if (Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) { // 24 hours expiration\n      return cachedData.response;\n    }\n  }\n\n  let response: string;\n  switch (model) {\n    case 'groq':\n      response = await groqChat(system, messages);\n      break;\n    case 'gpt4o':\n      response = await openaiChat(system, messages);\n      break;\n    case 'opus':\n      response = await claudeChat(system, messages);\n      break;\n    case 'gemini':\n      response = await geminiChat(gemini, system, messages);\n      break;\n    case 'geminiFlash':\n      response = await geminiChat(geminiFlash, system, messages);\n      break;\n    default:\n      throw new Error('Invalid model name');\n  }\n\n  writeFileSync(\n    cachePath, \n    JSON.stringify({ response, timestamp: Date.now() }, null, 2)\n  );\n\n  return response;\n}\n```",
      ],
    },
  ],
} satisfies ChangeSet)}

Here's the document content:
${value.rawChangeSet}`.trim(),
      );

      if (changeSet.generalNoteList?.length) {
        nrc.addDependantNode(OutputNNode, {
          description: "General notes for the project",
          value: nrc.createNodeRef({ type: "result", path: "result.generalNoteList", schema: "string[]" }),
        });
      }
      for (let i = 0; i < changeSet.filesToChange.length; i++) {
        nrc.addDependantNode(ApplyFileChangesNNode, {
          path: nrc.createNodeRef({
            type: "result",
            path: `result.filesToChange[${i}].absolutePathIncludingFileName`,
            schema: "string",
          }),
          changes: nrc.createNodeRef({ type: "result", path: `result.filesToChange[${i}].steps`, schema: "string[]" }),
        });
      }
      return { result: changeSet };
    },
    renderInputs: (v) => (
      <Well title="Raw Change Set" markdown>
        {v.rawChangeSet}
      </Well>
    ),
    // todo maybe do this better
    renderResult: (res) => <Well title="Result">{JSON.stringify(res.result, null, 2)}</Well>,
  },
);

export const ApplyFileChangesNNode = createNodeDef(
  "apply-file-changes",
  z.object({ path: orRef(z.string()), changes: orRef(z.array(z.string())) }),
  z.object({ original: z.string(), result: z.string() }),
  {
    run: async (value, nrc) => {
      const existingFile = await nrc.readFile(value.path);
      if (existingFile.type === "directory") throw new Error("Cannot apply changes to a directory");
      const original = existingFile.type === "file" ? existingFile.content : "";

      let output = await nrc.aiChat("geminiFlash", [
        {
          role: "user",
          content: `
<context>
${nrc.projectContext.rules.join("\n")}
</context>

Please take the following change set and output the final file, if it looks like the changes are a full file overwrite, output just the changes.
Your response will directly overwrite the file, so you MUST not omit any of the file content.
<file path="${value.path}">
${original}
</file>
<changes>
${value.changes.map((change) => `<change>${change}</change>`).join("\n")}
</changes>
          `.trim(),
        },
      ]);

      if (output.includes("```")) {
        const startIndex = output.indexOf("\n", output.indexOf("```"));
        const endIndex = output.lastIndexOf("\n", output.lastIndexOf("```"));
        output = output.slice(startIndex + 1, endIndex);
      }

      await nrc.writeFile(value.path, output);
      return { original, result: output };
    },
    renderInputs: (v) => (
      <Well title={`Changes ${v.path}`} markdown>
        {v.changes.map((change) => change).join("\n") || ""}
      </Well>
    ),
    // todo syntax highlighting
    renderResult: (res) => (
      <ReactDiffViewer oldValue={res.original} newValue={res.result} splitView={false} useDarkTheme />
    ),
  },
);
