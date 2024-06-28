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

Based on the research, please identify the relevant files for the goal.
The relevant files are the ones that are most likely to be impacted by the goal and may need to be modified or extended to support the new functionality.
Related files may also include files that would be useful to reference or provide context for the changes.
Also include 1 level of important dependencies for each file, with the full path to the dependency.
Finally, include a few files that can be used as inspiration for the changes.
I'd also recommend including any relevant files that define dependencies, like a package.json or requirements.txt.
Do not output code or code snippets, and do not attempt to create a plan to achieve the goal, an engineer will take the files you produce and create a plan with that additional context.
Do not list a file more than once.
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
