import uniq from "lodash/uniq";
import { orRef } from "streamweave-core";
import { z } from "zod";

import { getRelevantFiles, xmlProjectSettings } from "../ai-helpers";
import { swNode } from "../swNode";
import { ContextNNode, registerContextId } from "./ContextNNode";
import { ExecuteNNode } from "./ExecuteNNode";
import { ProjectAnalysisNNode, xmlFileSystemResearch } from "./ProjectAnalysisNNode";
import { RelevantFileAnalysisNNode } from "./RelevantFileAnalysisNNode";
import { WebResearchOrchestratorNNode } from "./WebResearchOrchestratorNNode";

export const PlanNNode = swNode
  .input(
    z.object({
      goal: orRef(z.string()),
      enableWebResearch: z.boolean().default(false),
      images: z.array(z.string()).optional(), // base64 encoded images
    }),
  )
  .output(z.object({ result: z.string(), relevantFiles: z.array(z.string()) }))
  .runnable(async (value, nrc) => {
    const extraContext = await nrc.findNode(ContextNNode, (n) => n.contextId === PlanNNode_ContextId);
    const prevIterationGoalContext = await nrc.findNode(
      ContextNNode,
      (n) => n.contextId === PlanNNode_PrevIterationGoalContextId,
    );
    const prevIterationChangeSetContext = await nrc.findNode(
      ContextNNode,
      (n) => n.contextId === PlanNNode_PrevIterationChangeSetContextId,
    );

    // analyze the project
    const { result: researchResult } = await nrc.runNode(ProjectAnalysisNNode, {});

    // find relevant files for the goal
    const relevantFilesPromise = nrc.runNode(RelevantFileAnalysisNNode, { goal: value.goal });

    // do web research if needed
    let webResearchResults: { query: string; result: string }[] = [];
    if (value.enableWebResearch) {
      const { results } = await nrc.runNode(WebResearchOrchestratorNNode, { goal: value.goal });
      webResearchResults = results;
    }

    const { files: relevantFiles } = await relevantFilesPromise;

    const planPrompt = `
${xmlProjectSettings(nrc.nodeContext)}
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
    await nrc.effects.writeDebugFile("debug-plan-prompt.json", JSON.stringify({ relevantFiles }, null, 2));
    await nrc.effects.writeDebugFile("debug-plan-prompt.txt", planPrompt);
    const plan = await nrc.effects.aiChat("sonnet", [
      {
        role: "user",
        content: value.images?.length
          ? [...value.images.map((image) => ({ type: "image" as const, image })), { type: "text", text: planPrompt }]
          : planPrompt,
      },
    ]);
    await nrc.effects.writeDebugFile("debug-plan.txt", plan);

    const planRelevantFiles = await getRelevantFiles(
      nrc,
      researchResult.files.map((f) => f.path),
      plan,
    );
    const mergedRelevantFiles = uniq([...relevantFiles, ...planRelevantFiles]);
    await nrc.effects.writeDebugFile(
      "debug-plan-relevant-files.json",
      JSON.stringify({ planRelevantFiles, mergedRelevantFiles }, null, 2),
    );

    nrc.queueNode(ExecuteNNode, {
      instructions: nrc.newRef({ type: "result", path: "result", schema: "string" }),
      relevantFiles: nrc.newRef({ type: "result", path: "relevantFiles", schema: "string[]" }),
    });
    return { result: plan, relevantFiles: mergedRelevantFiles };
  });

export type PlanNNodeValue = z.infer<typeof PlanNNode.inputSchema>;
export const PlanNNode_ContextId = registerContextId("plan-context", "Extra context for plan creation");

export const PlanNNode_PrevIterationGoalContextId = registerContextId(
  "plan-prev-iteration-goal-context",
  "The goal for the previous iteration of development",
);
export const PlanNNode_PrevIterationChangeSetContextId = registerContextId(
  "plan-prev-iteration-change-set-context",
  "The change set for the previous iteration of development",
);
