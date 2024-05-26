import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import llamaTokenizer from "llama-tokenizer-js";
import { isEqual, uniq } from "lodash";
import { dirname, join } from "path";
import { z } from "zod";

import { aiChat, openaiJson } from "./ai-chat";
import { getDepTree } from "./ts-utils";

enum NNodeType {
  Output = "output",

  ProjectAnalysis = "project-analysis",
  RelevantFileAnalysis = "relevant-file-analysis",
  TypescriptDepAnalysis = "typescript-dep-analysis",

  Plan = "plan",
  Execute = "execute",
  CreateChangeSet = "create-change-set",
  ApplyFileChanges = "apply-file-changes",
}

interface NNode {
  id: string;
  dependencies?: NNode[];
  value: NNodeValue;
}
type NNodeValue =
  | { type: NNodeType.Output; description: string; value: unknown }
  | { type: NNodeType.ProjectAnalysis }
  | { type: NNodeType.RelevantFileAnalysis; goal: string }
  | { type: NNodeType.TypescriptDepAnalysis }
  | { type: NNodeType.Plan; goal: string }
  | { type: NNodeType.Execute; instructions: string; relevantFiles: string[] }
  | { type: NNodeType.CreateChangeSet; rawChangeSet: string }
  | { type: NNodeType.ApplyFileChanges; path: string; changes: string[] };
type NNodeResult =
  | { type: NNodeType.Output }
  | { type: NNodeType.ProjectAnalysis; result: Awaited<ReturnType<typeof filesystemResearch>> }
  | { type: NNodeType.RelevantFileAnalysis; result: string; files: string[] }
  | { type: NNodeType.TypescriptDepAnalysis; result: ReturnType<typeof getDepTree> }
  | { type: NNodeType.Plan; result: string }
  | { type: NNodeType.Execute; result: string }
  | { type: NNodeType.CreateChangeSet; result: unknown }
  | { type: NNodeType.ApplyFileChanges; result: string };

interface ProjectContext {
  rules: string[];
  files: { projectAnchorFiles: string[] };
}

interface NodeRunnerContext {
  projectContext: ProjectContext;

  addDependantNode: (node: NNodeValue) => void;
  getOrAddDependencyForResult: <T extends NNodeType>(
    nodeValue: NNodeValue & { type: T },
    inheritDependencies?: boolean,
  ) => Promise<NNodeResult & { type: T }>;

  readFile: (
    path: string,
  ) => Promise<{ type: "not-found" } | { type: "file"; content: string } | { type: "directory"; files: string[] }>;
  writeFile: (path: string, content: string) => Promise<void>;
}

function findNodeByValue(nodes: NNode[], value: NNodeValue): NNode | undefined {
  const directDep = nodes.find((n) => isEqual(n.value, value));
  if (directDep) return directDep;
  for (const node of nodes) {
    const found = findNodeByValue(node.dependencies || [], value);
    if (found) return found;
  }
  return undefined;
}

async function runGraph(projectContext: ProjectContext, goal: string) {
  const nodes: NNode[] = [{ id: "plan", value: { type: NNodeType.Plan, goal } }];
  const nodeResults = new Map<string, NNodeResult>();

  const runStarted = new Set<string>();
  const runCompleted = new Set<string>();
  const runStack = [...nodes];

  async function startNode<T extends NNodeType>(
    node: NNode & { value: { type: T } },
  ): Promise<NNodeResult & { type: T }> {
    console.log("[runGraph] Starting node", node.id, node.value.type);
    runStarted.add(node.id);

    let addDependantNodeCounter = 0;
    let addDependencyNodeCounter = 0;
    const nodeRunnerContext: NodeRunnerContext = {
      projectContext,
      addDependantNode: (newNodeValue) => {
        console.log("[runGraph] Adding dependant node", newNodeValue);
        const newNode = {
          id: `${node.id}-dependant${addDependantNodeCounter++}`,
          value: newNodeValue,
          dependencies: [node],
        };
        nodes.push(newNode);
        runStack.push(newNode);
      },
      getOrAddDependencyForResult: async (nodeValue, inheritDependencies) => {
        const existing = findNodeByValue(node.dependencies || [], nodeValue);
        if (existing) {
          if (!nodeResults.has(existing.id)) throw new Error("Node result not found"); // this shouldn't happen since deps are processed first
          return nodeResults.get(existing.id) as any; // todo should this add the node as a direct dependency?
        }
        console.log("[runGraph] Adding dependency node", nodeValue);
        const newNode = {
          id: `${node.id}-dependency${addDependencyNodeCounter++}`,
          value: nodeValue,
          dependencies: inheritDependencies ? [...(node.dependencies || [])] : undefined,
        };
        node.dependencies = node.dependencies || [];
        node.dependencies.push(newNode);
        nodes.push(newNode);
        return await startNode(newNode as any);
      },
      readFile: async (path) => {
        console.log("[runGraph] Reading file", path);
        if (!existsSync(path)) return { type: "not-found" };
        if (statSync(path).isDirectory()) return { type: "directory", files: readdirSync(path) };
        return { type: "file", content: readFileSync(path, "utf-8") };
      },
      writeFile: async (path, content) => {
        console.log("[runGraph] Writing file", path);
        const dir = dirname(path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(path, content);
      },
    };
    // todo error handling
    const result = await runNode<T>(node, nodeRunnerContext);
    nodeResults.set(node.id, result);
    runCompleted.add(node.id);

    console.log("[runGraph] Completed node", node.id);
    return result;
  }

  // run the graph, keep consuming nodes until all nodes are completed
  while (runStack.length > 0) {
    const node = runStack.pop()!;
    if (runStarted.has(node.id)) continue;
    if (node.dependencies?.some((dep) => !runCompleted.has(dep.id))) {
      runStack.unshift(node); // todo do this better
      continue;
    }
    await startNode(node);
  }
}

function runNode<T extends NNodeType>(
  node: NNode & { value: { type: T } },
  nrc: NodeRunnerContext,
): Promise<NNodeResult & { type: T }> {
  const runners: { [T in NNodeType]: (value: NNodeValue & { type: T }) => Promise<NNodeResult & { type: T }> } = {
    [NNodeType.Output]: async (value) => {
      console.log("[OutputNode] ", value.description, value.value);
      return { type: NNodeType.Output };
    },

    [NNodeType.ProjectAnalysis]: async () => {
      const { result: typescriptResult } = await nrc.getOrAddDependencyForResult({
        type: NNodeType.TypescriptDepAnalysis,
      });
      const researchResult = await filesystemResearch([...Object.keys(typescriptResult)], typescriptResult, nrc);
      return { type: NNodeType.ProjectAnalysis, result: researchResult };
    },
    [NNodeType.RelevantFileAnalysis]: async (value) => {
      const { result: typescriptResult } = await nrc.getOrAddDependencyForResult({
        type: NNodeType.TypescriptDepAnalysis,
      });
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(
        {
          type: NNodeType.ProjectAnalysis,
        },
        true,
      );

      const rawRelevantFiles = await aiChat("geminiFlash", SYSTEM, [
        {
          role: "user",
          content: `
Based on the research, please identify the relevant files for the goal.
The relevant files are the ones that are most likely to be impacted by the goal and may need to be modified or extended to support the new functionality.
Related files may also include files that would be useful to reference or provide context for the changes.
Goal: ${value.goal}

${researchResult.toPrompt({ showFileContent: true, showResearch: true })}
`.trim(),
        },
      ]);

      const RelevantFilesSchema = z.object({ files: z.array(z.string()) });
      const directRelevantFiles = await openaiJson(
        RelevantFilesSchema,
        SYSTEM,
        `Extract all the absolute paths for the relevant files from the following:\n\n${rawRelevantFiles}`,
      );
      const relevantFiles = uniq(
        directRelevantFiles.files.flatMap((f) => [
          f,
          ...(typescriptResult[f]?.map((d) => d.fileName).filter(<T>(f: T | undefined): f is T => f !== undefined) ||
            []),
        ]),
      );

      return { type: NNodeType.RelevantFileAnalysis, result: rawRelevantFiles, files: relevantFiles };
    },
    [NNodeType.TypescriptDepAnalysis]: async () => {
      const result = getDepTree(nrc.projectContext.files.projectAnchorFiles);
      return { type: NNodeType.TypescriptDepAnalysis, result };
    },

    [NNodeType.Plan]: async (value) => {
      const { result: researchResult } = await nrc.getOrAddDependencyForResult({
        type: NNodeType.ProjectAnalysis,
      });
      const { result: relevantFilesAnalysis, files: relevantFiles } = await nrc.getOrAddDependencyForResult(
        {
          type: NNodeType.RelevantFileAnalysis,
          goal: value.goal,
        },
        true,
      );
      const res = await aiChat("opus", SYSTEM, [
        {
          role: "user",
          content: `
Please create a plan for the following goal: ${value.goal}
The plan should include a list of steps to achieve the goal, as well as any potential obstacles or challenges that may arise.
Call out specific areas of the codebase that may need to be modified or extended to support the new functionality, and provide a high-level overview of the changes that will be required.
If using short file names, please include a legend at the top of the file with the absolute path to the file.
Contents for most files are omitted, but please comment on which files would be helpful to provide to improve the plan.

<context>
${nrc.projectContext.rules.join("\n")}
</context>
<relevantFilesAnalysis>
${relevantFilesAnalysis}
</relevantFilesAnalysis>
${researchResult.toPrompt({ showResearch: true, showFileContent: (f) => relevantFiles.includes(f) })}
                     `.trim(),
        },
      ]);

      nrc.addDependantNode({ type: NNodeType.Execute, instructions: res, relevantFiles });
      return { type: NNodeType.Plan, result: res };
    },
    [NNodeType.Execute]: async (value) => {
      const { result: researchResult } = await nrc.getOrAddDependencyForResult({
        type: NNodeType.ProjectAnalysis,
      });
      const res = await aiChat("gpt4o", SYSTEM, [
        {
          role: "user",
          content: `
<context>
${nrc.projectContext.rules.join("\n")}
</context>
${researchResult.toPrompt({ showResearch: true, showFileContent: true, filterFiles: (f) => value.relevantFiles.includes(f) })}
<instructions>
${value.instructions}
</instructions>

Please suggest changes to the provided files based on the plan.
Suggestions may either be snippets or full files, it should be clear enough for a junior engineer to understand and apply.
Prefer snippets unless the file is small or the change is very large.
Make sure to be very clear about which file is changing and what the change is.
Please include a legend at the top of the file with the absolute path to the files you are changing.
Suggest adding imports in distinct, standalone snippets from the code changes.
If creating a new file, please provide the full file content.`.trim(),
        },
      ]);

      nrc.addDependantNode({ type: NNodeType.CreateChangeSet, rawChangeSet: res });
      return { type: NNodeType.Execute, result: res };
    },
    [NNodeType.CreateChangeSet]: async (value) => {
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
            steps: z.array(z.string()),
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
        nrc.addDependantNode({
          type: NNodeType.Output,
          description: "General notes for the project",
          value: changeSet.generalNoteList,
        });
      }
      for (const file of changeSet.filesToChange) {
        nrc.addDependantNode({
          type: NNodeType.ApplyFileChanges,
          path: file.absolutePathIncludingFileName,
          changes: file.steps,
        });
      }
      return { type: NNodeType.CreateChangeSet, result: changeSet };
    },
    [NNodeType.ApplyFileChanges]: async (value) => {
      const existingFile = await nrc.readFile(value.path);
      if (existingFile.type === "directory") throw new Error("Cannot apply changes to a directory");

      let output = await aiChat("geminiFlash", SYSTEM, [
        {
          role: "user",
          content: `
<context>
${nrc.projectContext.rules.join("\n")}
</context>

Please take the following change set and output the final file, if it looks like the changes are a full file overwrite, output just the changes.
Your response will directly overwrite the file, so you MUST not omit any of the file content.
<file path="${value.path}">
${existingFile.type === "file" ? existingFile.content : ""}
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
      return { type: NNodeType.ApplyFileChanges, result: output };
    },
  };
  return (runners as any)[node.value.type](node.value);
}

const SYSTEM = `
You are an expert staff level software engineer.
Working with other staff level engineers on a project.
Do not bikeshed unless asked.
Provide useful responses, make sure to consider when to stay high level and when to dive deep.
`.trim();

function xmlFile(obj: { path: string; content: string; research: string }) {
  return {
    path: obj.path,
    content: obj.content,
    toPrompt: ({ showFileContent = false as boolean | ((path: string) => boolean), showResearch = false } = {}) => {
      const showFileContentForPath =
        typeof showFileContent === "function" ? showFileContent(obj.path) : showFileContent;
      return `<file path="${obj.path}" ${showFileContentForPath ? "" : 'content-hidden="true"'}>
${showFileContentForPath ? `<content>\n${obj.content}\n</content>\n` : ""}
${showResearch ? `<research>\n${obj.research}\n</research>\n` : ""}
</file>`.trim();
    },
  };
}

function xmlFilesystemResearch({ files, research }: { files: ReturnType<typeof xmlFile>[]; research: string }) {
  return {
    files,
    research,
    toPrompt: ({
      showFileContent = false as boolean | ((path: string) => boolean),
      showResearch = false,
      filterFiles = (path: string) => true as boolean,
    } = {}) =>
      `
<report>
<files>
${files
  .filter((f) => filterFiles(f.path))
  .map((f) => f.toPrompt({ showFileContent, showResearch }))
  .join("\n\n")}
</files>
${showResearch ? `<research>\n${research}\n</research>\n` : ""}
</report>
      `.trim(),
  };
}

async function readFilesRecursively(
  files: string[],
  nrc: NodeRunnerContext,
): Promise<{ path: string; content: string }[]> {
  const res = await Promise.all(
    files.map(async (f) => {
      const result = await nrc.readFile(f);
      if (result.type === "not-found") return [];
      if (result.type === "file") return [{ path: f, content: result.content }];
      return await readFilesRecursively(
        result.files.map((ff) => join(f, ff)),
        nrc,
      );
    }),
  );
  return res.flat();
}

async function filesystemResearch(
  pendingFiles: string[],
  dependencies: Record<string, { fileName?: string; moduleSpecifier: string }[]>,
  nodeRunnerContext: NodeRunnerContext,
) {
  const rawFiles = await readFilesRecursively(pendingFiles, nodeRunnerContext);
  const files: ReturnType<typeof xmlFile>[] = [];
  for (const f of rawFiles) {
    console.log("filesystemResearch file", f.path);
    const research = await aiChat("geminiFlash", SYSTEM, [
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

  function constructBatchPrompt(batch: ReturnType<typeof xmlFile>[]) {
    return `
Could you please provide the following information:
- A summary of the coding conventions used in the codebase.
- An overview of the high-level structure, including key components and their interactions.
- Any notable design patterns or architectural decisions evident in the codebase.
- Any best practices or common patterns you can identify from the provided files.

<files>
${batch.map((f) => f.toPrompt({ showFileContent: true })).join("\n\n")}
</files>
`.trim();
  }

  let research;
  const totalBatchPrompt = constructBatchPrompt(files);
  const modelLimit = { groq: 8192, geminiFlash: 1e6 };
  const model = "geminiFlash" as const;
  if (llamaTokenizer.encode(totalBatchPrompt).length < modelLimit[model] * 0.6) {
    research = await aiChat(model, SYSTEM, [{ role: "user", content: constructBatchPrompt(files) }]);
  } else {
    console.log("Batching research");
    const seen = new Set<string>();
    const batchTokenThreshold = modelLimit[model] * 0.4;

    const docs = [];
    let batch: ReturnType<typeof xmlFile>[] = [];
    let priority: typeof stack = []; // files related to the current batch
    const stack = [...files];
    while (stack.length > 0) {
      const f = priority.length > 0 ? priority.shift()! : stack.shift()!;
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      batch.push(f);

      // prioritize files that are dependencies of the current batch
      const deps = dependencies[f.path];
      if (deps) priority.push(...stack.filter((d) => deps.some((dep) => dep.fileName === d.path)));

      // if the batch is too large, send it to the AI
      const batchPrompt = constructBatchPrompt(batch);
      if (batchPrompt.length > batchTokenThreshold) {
        console.log(
          "Running batch of",
          batch.length,
          "files",
          batch.map((f) => f.path),
        );
        docs.push(await aiChat(model, SYSTEM, [{ role: "user", content: batchPrompt }]));
        batch = [];
        priority = [];
      }
    }
    if (batch.length > 0)
      docs.push(await aiChat(model, SYSTEM, [{ role: "user", content: constructBatchPrompt(batch) }]));

    research = await aiChat(model, SYSTEM, [
      {
        role: "user",
        content: `
The following are the research results for a codebase, remove repeated information and consolidate the information into a single document.

${docs.map((doc) => `<doc>${doc}</doc>`).join("\n")}
`.trim(),
      },
    ]);
  }
  return xmlFilesystemResearch({ files, research });
}

async function iterate() {
  // const goal = "Move AI Chat helper functions to a separate file.";
  // const srcFiles = [join(__dirname, "./meta-nova-dev.ts")];
  // const goal = "Write a typescript script to help backport general autoAdd chat channels manually.";
  // const srcFiles = ["/Users/saswat/Documents/clones/bridge/apps/mobile/src/components/useTakeSnap.tsx"];

  const projectContext = {
    rules: [
      "Strict TypeScript is used throughout the codebase.",
      "Type inference is preferred over explicit types when possible.",
      "Prefer concise and expressive code over verbose code, but keep things readable and use comments if necessary.",
      "Never use require, always use import. Any exceptions must be justified with a comment.",
      "Do not refactor the codebase unless required for the task.",
      "Do not delete dead code or comments unless it is directly related to the task.",
      "Keep error handling to a minimum.",
      "Don't worry about unit tests unless they are explicitly asked for.",
      "It's fine to have large complex functions during the initial implementation as this is a proof of concept.",
    ],
    files: { projectAnchorFiles: ["/Users/saswat/Documents/clones/bridge/apps/mobile/src"] },
  };
  const goal = "Write a typescript script to help backport general autoAdd chat channels manually.";

  await runGraph(projectContext, goal);
}
iterate().catch(console.error);
