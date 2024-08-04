import { Badge } from "@radix-ui/themes";
import uniq from "lodash/uniq";
import { z } from "zod";

// @ts-expect-error needed to get bench working
import { Flex, styled } from "../../../../styled-system/jsx/index.mjs";
import { Well } from "../../../components/base/Well";
import { getRelevantFiles, xmlProjectSettings } from "../ai-helpers";
import { AIChatNEffect } from "../effects/AIChatNEffect";
import { WriteDebugFileNEffect } from "../effects/WriteDebugFileNEffect";
import { createNodeDef, NSDef } from "../node-types";
import { orRef } from "../ref-types";
import { ContextNNode, registerContextId } from "./ContextNNode";
import { ExecuteNNode } from "./ExecuteNNode";
import { ProjectAnalysisNNode, xmlFileSystemResearch } from "./ProjectAnalysisNNode";
import { RelevantFileAnalysisNNode } from "./RelevantFileAnalysisNNode";
import { WebResearchOrchestratorNNode } from "./WebResearchOrchestratorNNode";

export const PlanNNode = createNodeDef(
  { typeId: "plan", scopeDef: NSDef.codeChange },
  z.object({
    goal: orRef(z.string()),
    enableWebResearch: z.boolean().default(false),
    images: z.array(z.string()).optional(), // base64 encoded images
  }),
  z.object({ result: z.string(), relevantFiles: z.array(z.string()) }),
  {
    run: async (value, nrc) => {
      const extraContext = await nrc.findNodeForResult(ContextNNode, (n) => n.contextId === PlanNNode_ContextId);
      const prevIterationGoalContext = await nrc.findNodeForResult(
        ContextNNode,
        (n) => n.contextId === PlanNNode_PrevIterationGoalContextId,
      );
      const prevIterationChangeSetContext = await nrc.findNodeForResult(
        ContextNNode,
        (n) => n.contextId === PlanNNode_PrevIterationChangeSetContextId,
      );

      // analyze the project
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {});

      // find relevant files for the goal
      const relevantFilesPromise = nrc.getOrAddDependencyForResult(RelevantFileAnalysisNNode, { goal: value.goal });

      // do web research if needed
      let webResearchResults: { query: string; result: string }[] = [];
      if (value.enableWebResearch) {
        const { results } = await nrc.getOrAddDependencyForResult(WebResearchOrchestratorNNode, { goal: value.goal });
        webResearchResults = results;
      }

      const { files: relevantFiles } = await relevantFilesPromise;

      const planPrompt = `
${xmlProjectSettings(nrc.settings)}
<knownFiles>
${researchResult.files.map((f) => f.path).join("\n")}
</knownFiles>
${xmlFileSystemResearch(researchResult, { showResearch: true, showFileContent: true, filterFiles: (f) => relevantFiles.includes(f) })}
${webResearchResults.length ? `<webResearchResults>\n${webResearchResults.map((r) => `<webResearch query=${JSON.stringify(r.query)}>\n${r.result}\n</webResearch>`).join("\n")}\n</webResearchResults>` : ""}
${
  prevIterationGoalContext || prevIterationChangeSetContext
    ? `\n\nThe prevIteration represents changes made during the previous iteration of development.
This context is provided to inform the current planning process, even if the new goal differs from the previous one.
It may contain valuable information about:
1. Recent modifications to the codebase
2. New features or functionalities that were added
3. Challenges encountered and how they were addressed
4. Any architectural changes or design decisions made

While the current goal may be different, this context can be useful for:
- Understanding the current state of the project
- Identifying potential synergies or conflicts with recent changes
- Leveraging recent work that might be relevant to the new goal
- Avoiding duplication of effort or contradictory changes

Consider this information as you develop your plan, but remember that the new goal takes precedence.
Use this context to inform your planning process, not to constrain it.
Be aware the user may have manually updated files in the codebase after this change set was applied.
<prevIteration>
${prevIterationGoalContext ? `<goal>\n${prevIterationGoalContext.context}\n</goal>` : ""}
${prevIterationChangeSetContext ? `<changeSet>\n${prevIterationChangeSetContext.context}\n</changeSet>` : ""}
</prevIteration>`
    : ""
}
${extraContext ? `<extraContext>\n${extraContext.context}\n</extraContext>` : ""}

<goal>
${value.goal}
</goal>
Please create a plan for the given goal.
The plan should include a list of steps to achieve the goal, as well as any potential obstacles or challenges that may arise.
Call out specific areas of the codebase that may need to be modified or extended to support the new functionality, and provide a high-level overview of the changes that will be required.
If using short file names, please include a legend at the top of the file with the absolute path to the file (this should include paths to new files your plan creates).
Most files are omitted, but please comment on which files would be helpful to provide to improve the plan.

This plan will be sent to an engineer who'll make low-level changes to the codebase and submit for review, so keep the plan on point and avoid suggesting extraneous steps such as reminding them to send for review.
Any images won't be shown to the implementation engineer, so please include relevant details from them in the plan.
The implementation engineer will attempt to implement the file changes described in the plan first, without running any commands (a later engineer will run any relevant commands if needed).
  - consider this when suggesting file changes, especially as this means creating new projects would be best done by describing all the files that need to be created instead of suggesting to run a command to download boilerplate.
                    `.trim();
      await WriteDebugFileNEffect(nrc, "debug-plan-prompt.json", JSON.stringify({ relevantFiles }, null, 2));
      await WriteDebugFileNEffect(nrc, "debug-plan-prompt.txt", planPrompt);
      const plan = await AIChatNEffect(nrc, "sonnet", [
        {
          role: "user",
          content: value.images?.length
            ? [...value.images.map((image) => ({ type: "image" as const, image })), { type: "text", text: planPrompt }]
            : planPrompt,
        },
      ]);
      await WriteDebugFileNEffect(nrc, "debug-plan.txt", plan);

      const planRelevantFiles = await getRelevantFiles(
        nrc,
        researchResult.files.map((f) => f.path),
        plan,
      );
      const mergedRelevantFiles = uniq([...relevantFiles, ...planRelevantFiles]);
      await WriteDebugFileNEffect(
        nrc,
        "debug-plan-relevant-files.json",
        JSON.stringify({ planRelevantFiles, mergedRelevantFiles }, null, 2),
      );

      nrc.addDependantNode(ExecuteNNode, {
        instructions: nrc.createNodeRef({ type: "result", path: "result", schema: "string" }),
        relevantFiles: nrc.createNodeRef({ type: "result", path: "relevantFiles", schema: "string[]" }),
      });
      return { result: plan, relevantFiles: mergedRelevantFiles };
    },
    renderInputs: (v) => (
      <>
        <Well title="Goal" markdownPreferred>
          {v.goal}
        </Well>
        {!!v.images?.length && (
          <styled.div>
            <Badge>{v.images.length} images</Badge>
            <Flex css={{ flexWrap: "wrap", gap: "10px" }}>
              {v.images.map((image, index) => (
                <styled.img
                  key={index}
                  src={image}
                  alt={`Uploaded image ${index + 1}`}
                  css={{ width: "100px", height: "100px", objectFit: "contain", bg: "black" }}
                  onClick={() => {
                    const win = window.open();
                    if (!win) return;
                    win.document.write(
                      "<img src=" +
                        image +
                        " style='width: 100vw; height: 100vh; object-fit: contain; background-color: black;' />",
                    );
                    win.document.body.style.margin = "0";
                    win.document.body.style.padding = "0";
                    win.document.body.style.overflow = "hidden";
                  }}
                />
              ))}
            </Flex>
          </styled.div>
        )}
        {v.enableWebResearch ? (
          <Badge color="green">Web Research Enabled</Badge>
        ) : (
          <Badge color="red">Web Research Disabled</Badge>
        )}
      </>
    ),
    renderResult: (res) => (
      <Well title="Result" markdownPreferred>
        {res.result}
      </Well>
    ),
  },
);

export type PlanNNodeValue = z.infer<typeof PlanNNode.valueSchema>;
export const PlanNNode_ContextId = registerContextId(PlanNNode, "plan-context", "Extra context for plan creation");

export const PlanNNode_PrevIterationGoalContextId = registerContextId(
  PlanNNode,
  "plan-prev-iteration-goal-context",
  "The goal for the previous iteration of development",
);
export const PlanNNode_PrevIterationChangeSetContextId = registerContextId(
  PlanNNode,
  "plan-prev-iteration-change-set-context",
  "The change set for the previous iteration of development",
);
