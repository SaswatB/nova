import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { createNodeDef } from "../node-types";
import { orRef } from "../ref-types";
import { ContextNNode, registerContextId } from "./ContextNNode";
import { ExecuteNNode } from "./ExecuteNNode";
import { ProjectAnalysisNNode, xmlFileSystemResearch } from "./ProjectAnalysisNNode";
import { RelevantFileAnalysisNNode } from "./RelevantFileAnalysisNNode";

export const PlanNNode = createNodeDef(
  "plan",
  z.object({ goal: orRef(z.string()) }),
  z.object({ result: z.string() }),
  {
    run: async (value, nrc) => {
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {});
      const { files: relevantFiles, createNodeRef: createRelevantFilesRef } = await nrc.getOrAddDependencyForResult(
        RelevantFileAnalysisNNode,
        { goal: value.goal },
        true,
      );
      const extraContext = await nrc.findNodeForResult(ContextNNode, (n) => n.contextId === PlanNNode_ContextId);
      const res = await nrc.aiChat("gemini", [
        {
          role: "user",
          content: `
<context>
${nrc.projectContext.rules.join("\n")}
</context>

${xmlFileSystemResearch(researchResult, { showResearch: true, showFileContent: (f) => relevantFiles.includes(f) })}${extraContext ? `\n\n<extraContext>\n${extraContext.context}\n</extraContext>` : ""}

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
    renderInputs: (v) => (
      <Well title="Goal" markdownPreferred>
        {v.goal}
      </Well>
    ),
    renderResult: (res) => (
      <Well title="Result" markdownPreferred>
        {res.result}
      </Well>
    ),
  },
);

export const PlanNNode_ContextId = registerContextId(PlanNNode, "plan-context", "Extra context for plan creation");
