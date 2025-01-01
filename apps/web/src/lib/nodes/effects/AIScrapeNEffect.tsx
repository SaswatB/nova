import { SwNodeRunnerContextType } from "streamweave-core";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import { swEffect } from "../swEffect";

export const AIScrapeNEffect = swEffect.runnable(
  async (
    { jsonSchema, url, prompt }: { jsonSchema: Record<string, unknown>; url: string; prompt: string },
    { effectContext, signal },
  ) => effectContext.trpcClient.ai.scrape.mutate({ schema: jsonSchema, url, prompt }, { signal }),
);

export async function getAiScrapeParsed<T extends unknown>(
  nrc: SwNodeRunnerContextType<{ aiScrape: typeof AIScrapeNEffect }>,
  param: { schema: z.ZodSchema<T>; url: string; prompt: string },
) {
  const jsonSchema = zodToJsonSchema(param.schema, "S").definitions?.S as Record<string, unknown>;
  const response = await nrc.effects.aiScrape({ jsonSchema, url: param.url, prompt: param.prompt });
  return param.schema.parse(response);
}
