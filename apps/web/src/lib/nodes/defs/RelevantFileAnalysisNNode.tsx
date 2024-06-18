import uniq from "lodash/uniq";
import { z } from "zod";

import { isDefined } from "@repo/shared";

import { Well } from "../../../components/base/Well";
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
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {}, true);

      const rawRelevantFiles = await nrc.aiChat("geminiFlash", [
        {
          role: "user",
          content: `
${xmlFileSystemResearch(researchResult, { showResearch: true })}

Based on the research, please identify the relevant files for the goal.
The relevant files are the ones that are most likely to be impacted by the goal and may need to be modified or extended to support the new functionality.
Related files may also include files that would be useful to reference or provide context for the changes.
Also include 1 level of important dependencies for each file, with the full path to the dependency.
Finally, included a few files that can be used as inspiration for the changes.
Goal: ${value.goal}
`.trim(),
        },
      ]);

      const RelevantFilesSchema = z.object({ files: z.array(z.string()) });
      const directRelevantFiles = await nrc.aiJson(
        RelevantFilesSchema,
        `
Extract all the absolute paths for the files from the following document.
You may need to normalize the file path, here are all the file paths in this project.
Consider them as valid outputs which must be used.
${JSON.stringify(
  researchResult.files.map((f) => f.path),
  null,
  2,
)}

Document:
${rawRelevantFiles}`.trim(),
      );
      const relevantFiles = uniq(
        directRelevantFiles.files.flatMap((f) => [
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
        <Well title="Files">{res.files.join("\n")}</Well>
      </>
    ),
  },
);
