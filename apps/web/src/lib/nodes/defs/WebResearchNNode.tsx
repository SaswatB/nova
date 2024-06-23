import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { createNodeDef } from "../node-types";

export const WebResearchNNode = createNodeDef(
  "web-research",
  z.object({ query: z.string(), urls: z.array(z.string()).optional() }),
  z.object({
    result: z.string(),
    sources: z.array(z.object({ url: z.string(), title: z.string(), snippet: z.string() })),
  }),
  {
    run: async (value, nrc) => {
      const MAX_ITERATIONS = 3;

      const generateSearchTerms = async (query: string, context: string) => {
        const res = await nrc.aiJson(
          z.object({ terms: z.array(z.string()).min(0).max(3) }),
          `<query>\n${query}\n</query>\n<context>\n${context}\n</context>`,
          `
Based on the research goal and any previous context, suggest 1-3 specific search terms that would be effective for a web search.
Focus on terms that will yield diverse and relevant results.
If the provided context sufficiently answers the research goal, you can return an empty array.
          `.trim(),
        );
        return res.terms;
      };

      const performSearch = async (terms: string[]) => {
        const results = await Promise.all(terms.map((term) => nrc.aiWebSearch(term)));
        return results.flat();
      };

      const evaluateAndScrape = async (searchResults: Awaited<ReturnType<typeof performSearch>>, query: string) => {
        const relevantResults = await nrc.aiJson(
          z.object({
            results: z.array(
              z.object({ url: z.string(), relevance: z.number().min(0).max(100), justification: z.string() }),
            ),
          }),
          JSON.stringify(searchResults),
          `
Evaluate the relevance of each search result to the research goal: "${query}". 
Return an array of objects, each containing the 'url' and a 'relevance' score between 0 and 100. 
Choose only the most relevant results, aiming for ~3 high-quality sources.
          `.trim(),
        );
        const selectedResults = relevantResults.results.sort((a, b) => b.relevance - a.relevance).slice(0, 5);

        const filteredResults = searchResults
          .filter((result) => selectedResults.some((selected) => selected.url === result.link))
          .filter((result) => result.link !== null);

        const scrapedData = await Promise.all(
          filteredResults.map(async (result) => {
            const r = await nrc.aiScrape(
              z.object({ relevantInfo: z.string(), keyPoints: z.array(z.string()), codeSnippets: z.array(z.string()) }),
              result.link!,
              `Extract the most relevant information, key points, and code snippets related to the research goal: "${query}"`,
            );
            return { ...r, url: result.link! };
          }),
        );

        return { filteredResults, scrapedData };
      };

      const synthesizeInformation = async (
        scrapedData: Awaited<ReturnType<typeof evaluateAndScrape>>["scrapedData"],
        query: string,
      ) => {
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
<goal>
${query}
</goal>
<information>
${combinedInfo}
</information>

Synthesize and summarize the given information related to the research goal.
Highlight any gaps in the current information or areas that might benefit from further research.
            `.trim(),
          },
        ]);
      };

      let finalResult = "";
      let allSources: Awaited<ReturnType<typeof performSearch>> = [];
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const searchTerms = await generateSearchTerms(value.query, finalResult);
        const searchResults = await performSearch(searchTerms);
        const { filteredResults, scrapedData } = await evaluateAndScrape(searchResults, value.query);

        const iterationSummary = await synthesizeInformation(scrapedData, value.query);

        finalResult += (finalResult ? "\n\n" : "") + `Iteration ${i + 1}:\n${iterationSummary}`;
        allSources = [...allSources, ...filteredResults];

        const continueResearch = await nrc.aiJson(
          z.object({ shouldContinue: z.boolean() }),
          finalResult,
          `Based on the current research progress, should we continue with another iteration of search to gather more information for the research goal: "${value.query}"? Consider if there are significant gaps or if the current information is sufficient. Respond with true to continue or false to conclude the research.`,
        );

        if (!continueResearch.shouldContinue) break;
      }

      const finalSummary = await nrc.aiChat("gpt4o", [
        {
          role: "user",
          content: `
<research>
${finalResult}
</research>
<goal>
${value.query}
</goal>

Provide a comprehensive final summary of the research findings for the given goal.
Synthesize all the information gathered across iterations, highlight key insights, and address any remaining gaps or areas for future research.
          `.trim(),
        },
      ]);

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
            .map((source) => `${source.title.trim()} - ${source.url.trim()}\n${source.snippet.trim()}\n`)
            .join("\n")}
        </Well>
      </>
    ),
  },
);
