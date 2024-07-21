import { container } from "tsyringe";
import { z } from "zod";

import { aiChatImpl, AIChatOptionsSchema, aiJsonImpl, AIJsonOptionsSchema } from "@repo/shared";

import { GoogleService } from "../external/google.service";
import { ScraperService } from "../external/scraper.service";
import { aiApiKeys } from "../lib/env";
import { procedure, router } from "./meta/app-server";

const scraperService = container.resolve(ScraperService);
const googleService = container.resolve(GoogleService);

export const aiRouter = router({
  chat: procedure
    .input(AIChatOptionsSchema.omit({ apiKeys: true }))
    .mutation(async ({ input }) => aiChatImpl({ ...input, apiKeys: aiApiKeys })),
  json: procedure
    .input(AIJsonOptionsSchema.omit({ apiKeys: true }))
    .mutation(({ input }) => aiJsonImpl({ ...input, apiKeys: aiApiKeys })),
  webSearch: procedure
    .input(z.object({ query: z.string() }))
    .mutation(async ({ input }) => googleService.searchWeb(input.query)),
  scrape: procedure
    .input(z.object({ schema: z.record(z.unknown()), prompt: z.string(), url: z.string().url() }))
    .mutation(({ input }) => scraperService.scrapeWebsite(input.url, input.schema, input.prompt)),
});
