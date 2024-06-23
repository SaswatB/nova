import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import { generateCacheKey } from "../hash";
import { ProjectContext } from "./node-types";

const SYSTEM_PROMPT = `
You are an expert staff level software engineer.
Working with other staff level engineers on a project.
Do not bikeshed unless asked.
Provide useful responses, make sure to consider when to stay high level and when to dive deep.
`.trim();

export async function aiChat(
  ctx: ProjectContext,
  model: "groq" | "gpt4o" | "opus" | "sonnet" | "gemini" | "geminiFlash",
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const system = SYSTEM_PROMPT;
  const cacheKey = `aicache:${model}-${await generateCacheKey({ system, messages })}`;
  const cachedValue = await ctx.globalCacheGet<string>(cacheKey);
  if (cachedValue) return cachedValue;

  const response = await ctx.trpcClient.ai.chat.mutate({ model, system, messages });

  await ctx.globalCacheSet(cacheKey, response);
  return response;
}

export async function aiJson<T extends object>(
  ctx: ProjectContext,
  model: "gpt4o",
  schema: z.ZodSchema<T>,
  data: string,
): Promise<T> {
  const jsonSchema = zodToJsonSchema(schema, "S").definitions?.S as Record<string, unknown>;

  const system = SYSTEM_PROMPT;
  const cacheKey = `aicache:${model}-${await generateCacheKey({ jsonSchema, system, data })}`;
  const cachedValue = await ctx.globalCacheGet<T>(cacheKey);
  if (cachedValue) return cachedValue;

  const response = await ctx.trpcClient.ai.json.mutate({ model, schema: jsonSchema, prompt: system, data });
  const parsedResponse = schema.parse(response);

  await ctx.globalCacheSet(cacheKey, parsedResponse);
  return parsedResponse;
}
