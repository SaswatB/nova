import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { xmlProjectSettings } from "../ai-helpers";
import { createNodeDef } from "../node-types";
import { ProjectAnalysisNNode, xmlFileSystemResearch } from "./ProjectAnalysisNNode";
import { WebResearchHelperNNode } from "./WebResearchHelperNNode";

export const WebResearchOrchestratorNNode = createNodeDef(
  "web-research-orchestrator",
  z.object({ goal: z.string() }),
  z.object({ results: z.array(z.object({ query: z.string(), result: z.string() })) }),
  {
    run: async (value, nrc) => {
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {});

      const generateResearchTopics = async () => {
        return nrc.aiJson(
          z.object({
            webResearchRequests: z.array(
              z.object({
                priority: z.union(
                  [
                    z.literal("explicitly-requested"),
                    z.literal("likely-needed"),
                    z.literal("relevant"),
                    z.literal("helpful"),
                    z.literal("other"),
                  ],
                  {
                    description: `
The priority of this web research request, this influences the order in which web research is done:
explicitly-requested - This is a request that the user explicitly asked for
likely-needed - This is a request that is almost certainly needed to achieve the goal
relevant - This is a request that is potentially relevant but not strictly necessary to achieve the goal
helpful - This is a request that is potentially helpful but not strictly necessary to achieve the goal
other - Use this priority if none of the other options are appropriate
                    `.trim(),
                  },
                ),
                goal: z.string({
                  description: `
A natural language goal to research for on the web, ex: 'Find out how Redis recommends using distributed locks, look for TypeScript examples.'. 
This will be sent to a person to research (not directly into a search engine) so make sure to add enough context so that the goal is clear.
Include info such as language, libraries, frameworks, etc. as applicable.
                  `.trim(),
                }),
                urls: z
                  .array(
                    z.string({
                      description:
                        "A well formatted URL to search for on the web, this is expected to be a URL to specific content which can be used to answer the goal",
                    }),
                  )
                  .optional(),
              }),
            ),
          }),
          `
${xmlProjectSettings(nrc.settings)}
${xmlFileSystemResearch(researchResult, { showResearch: true, filterFiles: () => false })}

<goal>
${value.goal}
</goal>

An engineer is about to create a plan for the given goal.
Please provide relevant web research requests that can help them achieve the goal, these will be researched separately and then given to the engineer to help them create the plan.
It's very important to consider that researching topics on the web takes time, so please provide as few requests as possible to cover the most relevant topics.
If you aren't confident any research needs to be done, please respond with an empty array (especially if the goal is minor).
          `.trim(),
        );
      };

      const topics = await generateResearchTopics();
      const prioritizedTopics = topics.webResearchRequests
        .filter((t) => ["explicitly-requested", "likely-needed"].includes(t.priority))
        .slice(0, 3); // Limit to top 3 topics

      const results = await Promise.all(
        prioritizedTopics.map(async (topic) => {
          const { result } = await nrc.getOrAddDependencyForResult(WebResearchHelperNNode, {
            query: topic.goal,
            urls: topic.urls,
          });
          return { query: topic.goal, result };
        }),
      );

      return { results };
    },
    renderInputs: (v) => (
      <Well title="Research Goal" markdownPreferred>
        {v.goal}
      </Well>
    ),
    renderResult: (res) =>
      res.results.map((r, i) => (
        <Well key={i} title={r.query} markdownPreferred>
          {r.result}
        </Well>
      )),
  },
);
