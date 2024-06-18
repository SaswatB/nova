import ignore, { Ignore } from "ignore";
import llamaTokenizer from "llama-tokenizer-js";
import pLimit from "p-limit";
import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { generateCacheKey } from "../../hash";
import { createNodeDef, NodeRunnerContext } from "../node-types";

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
  await Promise.all(
    [".gitignore", ".novaignore"].map(async (ignoreFileName) => {
      const ignoreFile = await nrc.readFile(`${path}${ignoreFileName}`);
      if (ignoreFile.type === "file") {
        newIgnores.push({ dir: path, ignore: ignore().add(ignoreFile.content) });
      }
    }),
  );

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

export function xmlFilePrompt(
  file: ResearchedFile,
  { showFileContent = false as boolean | ((path: string) => boolean), showResearch = false } = {},
) {
  const showFileContentForPath = typeof showFileContent === "function" ? showFileContent(file.path) : showFileContent;
  return `<file path="${file.path}" ${showFileContentForPath ? "" : 'content-hidden="true"'}>
${showFileContentForPath ? `<content>\n${file.content}\n</content>\n` : ""}
${showResearch ? `<research>\n${file.research}\n</research>\n` : ""}
</file>`.trim();
}

export function xmlFileSystemResearch(
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
  nrc.writeDebugFile("debug.json", JSON.stringify({ count: rawFiles.length, rawFiles }, null, 2));
  const limit = pLimit(50);
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
  - Be sure to call out important files and directories, and their purpose.
- Any notable design patterns or architectural decisions evident in the codebase.
- Any best practices or common patterns you can identify from the provided files.

<files>
${batch.map((f) => xmlFilePrompt(f, { showFileContent: true })).join("\n\n")}
</files>
`.trim();
  }

  let research;
  const totalBatchPrompt = constructBatchPrompt(files);
  nrc.writeDebugFile("debug-batch.txt", totalBatchPrompt);
  nrc.writeDebugFile(
    "debug-batch-files.json",
    JSON.stringify({ tokens: llamaTokenizer.encode(totalBatchPrompt).length, count: files.length, files }, null, 2),
  );
  const modelLimit = { groq: 8192, geminiFlash: 1e6 };
  const model = "geminiFlash" as const;
  if (llamaTokenizer.encode(totalBatchPrompt).length < modelLimit[model] * 0.6) {
    research = await nrc.aiChat(model, [{ role: "user", content: constructBatchPrompt(files) }]);
  } else {
    console.log("Batching research");
    const seen = new Set<string>();
    const batchTokenThreshold = modelLimit[model] * 0.4;

    const docs: { files: string[]; research: string }[] = [];
    let batch: ResearchedFile[] = [];
    let batchPromptLength = 0;
    let batchPromptTokens = 0;
    let priority: typeof stack = []; // files related to the current batch
    const stack = [...files];
    while (stack.length >= 0) {
      const f = priority.length > 0 ? priority.shift()! : stack.shift();
      if (f) {
        if (seen.has(f.path)) continue;
        seen.add(f.path);
        batch.push(f);
      }

      // prioritize files that are dependencies of the current batch
      // const deps = dependencies[f.path];
      // if (deps) priority.push(...stack.filter((d) => deps.some((dep) => dep.fileName === d.path)));

      // if the batch is too large, send it to the AI
      const batchPrompt = constructBatchPrompt(batch);
      batchPromptTokens += llamaTokenizer.encode(batchPrompt.substring(batchPromptLength)).length; // this isn't fully accurate, but it's much faster to calculate
      batchPromptLength = batchPrompt.length;
      console.log("batchPromptTokens", batchPromptTokens);
      if (stack.length === 0 || batchPromptTokens > batchTokenThreshold) {
        nrc.writeDebugFile(`debug-batch-prompt-${stack.length}.txt`, batchPrompt);
        nrc.writeDebugFile(
          `debug-batch-files-${stack.length}.json`,
          JSON.stringify({ batchPromptTokens, files: batch }, null, 2),
        );
        console.log(
          "Running batch of",
          batch.length,
          "files",
          batch.map((f) => f.path),
        );
        docs.push({
          files: batch.map((f) => f.path),
          research: await nrc.aiChat(model, [{ role: "user", content: batchPrompt }]),
        });
        nrc.writeDebugFile("debug-batch-docs.json", JSON.stringify({ docs }, null, 2));
        batch = [];
        batchPromptLength = 0;
        batchPromptTokens = 0;
        priority = [];
      }

      if (stack.length === 0) break;
    }
    console.log(docs.length, "docs");

    const researchPrompt = `
The following are the research results for a codebase, remove repeated information and consolidate the information into a single document.
Keep as much research information as possible (not including the file list), but don't make up new information.

${docs.map((doc) => `<docs>\n<files>\n${doc.files.join("\n")}\n</files>\n<research>\n${doc.research}\n</research>\n</docs>`).join("\n")}
`.trim();
    nrc.writeDebugFile("debug-research-prompt.txt", researchPrompt);
    research = await nrc.aiChat(model, [{ role: "user", content: researchPrompt }]);

    nrc.writeDebugFile("debug-research.txt", research);
  }

  await nrc.setCache("project-analysis", { research, fileHashes, timestamp: Date.now() } satisfies z.infer<
    typeof cachedProjectAnalysisSchema
  >);
  return { files, research };
}

export const ProjectAnalysisNNode = createNodeDef(
  "project-analysis",
  z.object({}),
  z.object({ result: ResearchedFileSystem }),
  {
    run: async (value, nrc) => ({ result: await projectAnalysis(nrc) }),
    renderInputs: () => null,
    renderResult: (res) => (
      <>
        <Well title="Research" markdownPreferred>
          {res.result.research}
        </Well>
        <Well title="Files" markdownPreferred>
          {/* todo maybe allow looking at individual files? */}
          {`${res.result.files.length} source files processed`}
        </Well>
      </>
    ),
  },
);
