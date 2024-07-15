import uniq from "lodash/uniq";
import { z } from "zod";

import { isDefined } from "@repo/shared";

import { Well } from "../../../components/base/Well";
import { getRelevantFiles } from "../ai-helpers";
import { createNodeDef } from "../node-types";
import { orRef } from "../ref-types";
import { ProjectAnalysisNNode, xmlFileSystemResearch } from "./ProjectAnalysisNNode";

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
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {});

      if (researchResult.files.length === 0) {
        return {
          result: "This is an empty project. No relevant files could be identified.",
          files: [],
        };
      }

      const rawRelevantFiles = await nrc.aiChat("geminiFlash", [
        {
          role: "user",
          content: `
${xmlFileSystemResearch(researchResult, { showResearch: true })}
<goal>
${value.goal}
</goal>

Based on the research, please identify the most relevant files for the goal. Be highly selective and limit your response to a maximum of 5-7 files unless otherwise instructed. Focus on:

1. Core files that will directly implement the new functionality (2-3 files max).
2. Key files that provide essential context or will require minor modifications (1-2 files max).
3. One example file that can serve as inspiration for the changes.
4. One relevant configuration file (e.g., package.json, requirements.txt) if applicable.

For each file, briefly explain its relevance to the goal in one sentence.

Do not include:
- Indirect dependencies
- Files that are only tangentially related
- Duplicate files

Do not output code snippets or create a plan to achieve the goal. An engineer will use this focused list to develop a plan with the necessary context.
`.trim(),
        },
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
    renderInputs: (v) => (
      <Well title="Goal" markdownPreferred>
        {v.goal}
      </Well>
    ),
    renderResult: (res) => (
      <>
        <Well title="Result" markdownPreferred>
          {res.result}
        </Well>
        <Well title="Files">{res.files.length === 0 ? "No relevant files (empty project)" : res.files.join("\n")}</Well>
      </>
    ),
  },
);
