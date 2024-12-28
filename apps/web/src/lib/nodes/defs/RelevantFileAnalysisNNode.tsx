import uniq from "lodash/uniq";
import { orRef } from "streamweave-core";
import { z } from "zod";

import { isDefined } from "@repo/shared";

import { getRelevantFiles } from "../ai-helpers";
import { swNode } from "../swNode";
import { ProjectAnalysisNNode, xmlFileSystemResearch } from "./ProjectAnalysisNNode";

export const RelevantFileAnalysisNNode = swNode
  .input(z.object({ goal: orRef(z.string()) }))
  .output(z.object({ result: z.string(), files: z.array(z.string()) }))
  .runnable(
    async (value, nrc) => {
      // todo lm_ec44d16eee restore ts deps
      // const { result: typescriptResult } = await nrc.getOrAddDependencyForResult({
      //   type: NNodeType.TypescriptDepAnalysis,
      // });
      const typescriptResult = {} as Record<string, { fileName: string }[]>;
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {});

      if (researchResult.files.length === 0) {
        return {
          result: "This is an empty project. No relevant files could be identified.",
          files: [],
        };
      }

      const rawRelevantFiles = await nrc.effects.aiChat("gemini", [
        `
${xmlFileSystemResearch(researchResult, { showResearch: true })}
<goal>
${value.goal}
</goal>

Based on the provided file system research and the specified goal, identify and list the most relevant files for accomplishing this task. Your response should be structured as follows:

1. A brief summary (2-3 sentences) of how you interpret the goal and its implications for the codebase.

2. A comprehensive list of relevant files, each formatted as:
   [file_path] - [one-sentence explanation of relevance]

Guidelines for file selection:
- Choose ALL files that are directly related to implementing, modifying, or understanding the goal.
- Include a diverse set of file types: implementation files, context-providing files, configuration files, and relevant examples.
- Prioritize files based on their importance and relevance to the goal.
- Avoid tangentially related or duplicate files.

Important:
- Do not include code snippets or implementation details.
- Do not create a plan or suggest steps to achieve the goal.
- Focus solely on identifying and explaining the relevance of each file.

Your response will be used by an engineer to develop a comprehensive plan with the necessary context.
`.trim(),
      ]);

      const directRelevantFiles = await getRelevantFiles(
        nrc,
        researchResult.files.map((f) => f.path),
        rawRelevantFiles,
      );
      const relevantFiles = uniq(
        directRelevantFiles.flatMap((f) => [
          f,
          ...(typescriptResult[f]?.map((d) => d.fileName).filter(isDefined) || []),
        ]),
      );

      return { result: rawRelevantFiles, files: relevantFiles };
    },
    // renderInputs: (v) => (
    //   <Well title="Goal" markdownPreferred>
    //     {v.goal}
    //   </Well>
    // ),
    // renderResult: (res) => (
    //   <>
    //     <Well title="Result" markdownPreferred>
    //       {res.result}
    //     </Well>
    //     <Well title="Files">{res.files.length === 0 ? "No relevant files (empty project)" : res.files.join("\n")}</Well>
    //   </>
    // ),
  );
