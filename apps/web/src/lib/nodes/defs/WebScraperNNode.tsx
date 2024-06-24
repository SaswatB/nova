import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { createNodeDef } from "../node-types";

export const WebScraperNNode = createNodeDef(
  "web-scraper",
  z.object({ url: z.string(), query: z.string() }),
  z.object({
    title: z.string().optional(),
    relevantInfo: z.string(),
    keyPoints: z.array(z.string()),
    codeSnippets: z.array(z.string()),
    helpfulLinks: z.array(z.object({ url: z.string(), justification: z.string() })),
  }),
  {
    run: async (value, nrc) => {
      const result = await nrc.aiScrape(
        z.object({
          title: z.string().optional(),
          relevantInfo: z.string(),
          keyPoints: z.array(z.string()),
          codeSnippets: z.array(z.string({ description: "Code snippet blocks, with comments, in markdown" })),
          helpfulLinks: z.array(z.object({ url: z.string(), justification: z.string() })),
        }),
        value.url,
        `Extract the most relevant information, key points, code snippets, and helpful links related to the research query: "${value.query}"`,
      );
      return result;
    },
    renderInputs: (v) => (
      <>
        <Well title="URL">{v.url}</Well>
        <Well title="Query">{v.query}</Well>
      </>
    ),
    renderResult: (res) => (
      <>
        {res.title && <Well title="Title">{res.title}</Well>}
        <Well title="Relevant Information" markdownPreferred>
          {res.relevantInfo}
        </Well>
        <Well title="Key Points" markdownPreferred>
          {res.keyPoints.map((point, index) => `${index + 1}. ${point}`).join("\n")}
        </Well>
        <Well title="Code Snippets" markdownPreferred>
          {res.codeSnippets.map((snippet, index) => `Snippet ${index + 1}:\n${snippet}`).join("\n\n")}
        </Well>
        <Well title="Helpful Links" markdownPreferred>
          {res.helpfulLinks
            .map((link, index) => `${index + 1}. [${link.url}](${link.url})\n   Justification: ${link.justification}`)
            .join("\n\n")}
        </Well>
      </>
    ),
  },
);
