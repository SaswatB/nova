import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { createNodeDef } from "../node-types";
import { orRef } from "../ref-types";
import { CreateChangeSetNNode } from "./CreateChangeSetNNode";
import { ProjectAnalysisNNode, xmlFileSystemResearch } from "./ProjectAnalysisNNode";

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
        <Well title="Instructions" markdownPreferred>
          {v.instructions}
        </Well>
        <Well title="Relevant Files">{v.relevantFiles.map((file) => file).join("\n") || ""}</Well>
      </>
    ),
    renderResult: (res) => (
      <Well title="Result" markdownPreferred>
        {res.result}
      </Well>
    ),
  },
);
