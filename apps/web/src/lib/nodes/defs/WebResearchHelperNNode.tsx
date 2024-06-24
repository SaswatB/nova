import { uniq } from "lodash";
import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { createNodeDef } from "../node-types";
import { WebScraperNNode } from "./WebScraperNNode";

export const WebResearchHelperNNode = createNodeDef(
  "web-research-helper",
  z.object({ query: z.string(), urls: z.array(z.string()).optional() }),
  z.object({
    result: z.string(),
    sources: z.array(z.object({ url: z.string(), title: z.string().optional() })),
  }),
  {
    run: async (value, nrc) => {
      const MAX_ITERATIONS = 3;
      let allSources: { link: string; title?: string; snippet?: string }[] = [];

      const performSearch = async (query: string, context: string) => {
        // generate search terms
        const { terms } = await nrc.aiJson(
          z.object({ terms: z.array(z.string()).min(0).max(3) }),
          `<query>\n${query}\n</query>\n<context>\n${context}\n</context>`,
          `
Based on the research query and any previous context, suggest 1-3 specific search terms that would be effective for a web search.
Focus on terms that will yield diverse and relevant results.
If the provided context sufficiently answers the research query, you can return an empty array.
          `.trim(),
        );

        // perform the search
        const searchResults = (await Promise.all(terms.map((term) => nrc.aiWebSearch(term)))).flat();

        // evaluate the search results
        const relevantResults = await nrc.aiJson(
          z.object({
            results: z.array(
              z.object({ url: z.string(), relevance: z.number().min(0).max(100), justification: z.string() }),
            ),
          }),
          JSON.stringify(searchResults),
          `
Evaluate the relevance of each search result to the research query: "${query}". 
Return an array of objects, each containing the 'url' and a 'relevance' score between 0 and 100. 
Choose only the most relevant results, aiming for ~3 high-quality sources.
          `.trim(),
        );

        // return the best results
        const selectedResults = relevantResults.results.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
        return searchResults
          .filter((result) => selectedResults.some((selected) => selected.url === result.link))
          .filter((result) => result.link !== null);
      };

      const scrapeUrl = async (url: string, query: string) => {
        const result = await nrc.getOrAddDependencyForResult(WebScraperNNode, { url, query });
        allSources.push({ link: url, title: result.title || "" });
        return { url, ...result };
      };

      const synthesizeInformation = async (scrapedData: Awaited<ReturnType<typeof scrapeUrl>>[], query: string) => {
        const combinedInfo = scrapedData
          .map(
            (data) => `
<source url="${data.url}">
<relevantInfo>${data.relevantInfo}</relevantInfo>
<keyPoints>
${data.keyPoints.map((point) => `<point>${point}</point>`).join("\n    ")}
</keyPoints>
<codeSnippets>
${data.codeSnippets.map((snippet) => `<snippet>${snippet}</snippet>`).join("\n    ")}
</codeSnippets>
</source>`,
          )
          .join("\n");

        return nrc.aiChat("gpt4o", [
          {
            role: "user",
            content: `
<query>
${query}
</query>
<information>
${combinedInfo}
</information>

Synthesize and summarize the given information related to the research query.
Highlight any gaps in the current information or areas that might benefit from further research and include helpful links as applicable.
            `.trim(),
          },
        ]);
      };

      let linksToVisit = value.urls || [];
      let finalResult = "";

      for (let i = 0; i < MAX_ITERATIONS; i++) {
        if (linksToVisit.length === 0) {
          // if there are no links to visit, find some by searching the web
          const searchResults = await performSearch(value.query, finalResult);
          linksToVisit = searchResults.map((result) => result.link!);
        }

        linksToVisit = uniq(linksToVisit.filter((link) => !allSources.some((source) => source.link === link))).slice(
          0,
          5,
        );
        if (linksToVisit.length === 0) break;

        const scrapedData = await Promise.all(linksToVisit.map((link) => scrapeUrl(link, value.query)));
        const iterationSummary = await synthesizeInformation(scrapedData, value.query);

        finalResult += (finalResult ? "\n\n" : "") + `Iteration ${i + 1}:\n${iterationSummary}`;

        const continueResearch = await nrc.aiJson(
          z.object({
            shouldContinue: z.boolean(),
            justification: z.string(),
            prioritizedUrls: z.array(z.string()).optional(),
          }),
          finalResult,
          `
Based on the current research progress, should we continue with another iteration of search to gather more information for the research query: "${value.query}"?
Consider if there are significant gaps or if the current information is sufficient.
Respond with true to continue or false to conclude the research.
If you continue, provide an array of the best URLs to search for in the next iteration, (only if any look promising).
If you choose to continue, consider adding urls that would be good candidates for further research.
          `.trim(),
        );

        if (!continueResearch.shouldContinue) break;
        linksToVisit = continueResearch.prioritizedUrls?.filter((url) => finalResult.includes(url)) || []; // only allow links that are explicitly mentioned in the final result (to avoid hallucinations)
      }

      const finalSummary = finalResult
        ? await nrc.aiChat("gpt4o", [
            {
              role: "user",
              content: `
<research>
${finalResult}
</research>
<query>
${value.query}
</query>

Provide a comprehensive final summary of the research findings for the given query.
Synthesize all the information gathered across iterations, highlight key insights, and address any remaining gaps or areas for future research.
          `.trim(),
            },
          ])
        : "";

      return {
        result: finalSummary,
        sources: allSources.map((result) => ({
          url: result.link!,
          title: result.title || "",
          snippet: result.snippet || "",
        })),
      };
    },
    renderInputs: (v) => (
      <Well title="Query" markdownPreferred>
        {v.query}
      </Well>
    ),
    renderResult: (res) => (
      <>
        <Well title="Result" markdownPreferred>
          {res.result}
        </Well>
        <Well title="Sources" markdownPreferred>
          {res.sources
            .map((source) => "* " + [source.title?.trim(), source.url.trim()].filter((s) => !!s).join(" - "))
            .join("\n")}
        </Well>
      </>
    ),
  },
);
