import { z } from "zod";

import { getAiScrapeParsed } from "../effects/AIScrapeNEffect";
import { swNode } from "../swNode";

export const WebScraperNNode = swNode
  .input(z.object({ url: z.string(), query: z.string() }))
  .output(
    z.object({
      title: z.string().optional(),
      relevantInfo: z.string(),
      keyPoints: z.array(z.string()),
      codeSnippets: z.array(z.string()),
      helpfulLinks: z.array(z.object({ url: z.string(), justification: z.string() })),
    }),
  )
  .runnable(async (value, nrc) => {
    const result = await getAiScrapeParsed(nrc, {
      schema: z.object({
        title: z.string().optional(),
        relevantInfo: z.string(),
        keyPoints: z.array(z.string()),
        codeSnippets: z.array(z.string({ description: "Code snippet blocks, with comments, in markdown" })),
        helpfulLinks: z.array(z.object({ url: z.string(), justification: z.string() })),
      }),
      url: value.url,
      prompt: `Extract the most relevant information, key points, code snippets, and helpful links related to the research query: "${value.query}"`,
    });
    return result;
  });
