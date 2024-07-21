import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { zerialize } from "zodex";

import { aiChatImpl, aiJsonImpl, Message, Model } from "@repo/shared";

import { throwError } from "../err";
import { generateCacheKey } from "../hash";
import { getLocalStorage } from "../hooks/useLocalStorage";
import { lsKey } from "../keys";
import { ProjectContext } from "./project-ctx";

const SYSTEM_PROMPT = `
You are an expert staff level software engineer, working with other staff level engineers on a project.
Do not bikeshed unless asked.
Provide useful responses, make sure to consider when to stay high level and when to dive deep.
`.trim();

export async function aiChat(
  ctx: ProjectContext,
  model: Model,
  messages: Message[],
  signal: AbortSignal,
): Promise<string> {
  const system = SYSTEM_PROMPT;
  const cacheKey = `aicache-${model}-${await generateCacheKey({ system, messages })}`;
  const cachedValue = await ctx.globalCacheGet<string>(cacheKey);
  if (cachedValue) return cachedValue;

  const response = getLocalStorage(lsKey.localModeEnabled, false)
    ? await aiChatImpl({
        model,
        system,
        messages,
        signal,
        apiKeys: getLocalStorage(lsKey.localModeSettings, {}).apiKeys || throwError("No API keys set"),
      })
    : await ctx.trpcClient.ai.chat.mutate({ model, system, messages }, { signal });

  await ctx.globalCacheSet(cacheKey, response);
  return response;
}

export async function aiJson<T extends object>(
  ctx: ProjectContext,
  model: Model,
  schema: z.ZodSchema<T>,
  data: string,
  prompt = SYSTEM_PROMPT,
  signal: AbortSignal,
): Promise<T> {
  // this is breaking typescript, so use any to disable typechecking
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const jsonSchema = (zerialize as any)(schema);

  const cacheKey = `aicache-${model}-${await generateCacheKey({ jsonSchema, prompt, data })}`;
  const cachedValue = await ctx.globalCacheGet<T>(cacheKey);
  if (cachedValue) return cachedValue;

  const response = getLocalStorage(lsKey.localModeEnabled, false)
    ? await aiJsonImpl({
        model,
        schema: jsonSchema,
        data: `${prompt}\n\n${data}`,
        signal,
        apiKeys: getLocalStorage(lsKey.localModeSettings, {}).apiKeys || throwError("No API keys set"),
      })
    : await ctx.trpcClient.ai.json.mutate({ model, schema: jsonSchema, data: `${prompt}\n\n${data}` }, { signal });
  const parsedResponse = schema.parse(response);

  await ctx.globalCacheSet(cacheKey, parsedResponse);
  return parsedResponse;
}

export async function aiWebSearch(ctx: ProjectContext, query: string, signal: AbortSignal) {
  const cacheKey = `aicache-websearch-${await generateCacheKey({ query })}`;
  const cachedValue = await ctx.globalCacheGet<typeof response>(cacheKey); // todo expire
  if (cachedValue) return cachedValue;

  const response = await ctx.trpcClient.ai.webSearch.mutate({ query }, { signal });

  await ctx.globalCacheSet(cacheKey, response);
  return response;
}

export async function aiScrape<T extends object>(
  ctx: ProjectContext,
  schema: z.ZodSchema<T>,
  url: string,
  prompt: string,
  signal: AbortSignal,
): Promise<T> {
  const jsonSchema = zodToJsonSchema(schema, "S").definitions?.S as Record<string, unknown>;

  const cacheKey = `aicache-scraper-${await generateCacheKey({ jsonSchema, url, prompt })}`;
  const cachedValue = await ctx.globalCacheGet<T>(cacheKey);
  if (cachedValue) return cachedValue;

  const response = await ctx.trpcClient.ai.scrape.mutate({ schema: jsonSchema, url, prompt }, { signal });
  const parsedResponse = schema.parse(response);

  await ctx.globalCacheSet(cacheKey, parsedResponse);
  return parsedResponse;
}
