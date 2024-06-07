import * as idb from "idb-keyval";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import { generateCacheKey } from "../hash";
import { ProjectContext } from "./nodes/node-types";

export async function aiChat(
  ctx: ProjectContext,
  model: "groq" | "gpt4o" | "opus" | "gemini" | "geminiFlash",
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const cacheKey = `aicache:${model}-${await generateCacheKey({ system, messages })}`;
  const cachedValue = await idb.get(cacheKey);
  if (cachedValue) return cachedValue;

  const response = await ctx.trpcClient.ai.chat.mutate({ model, system, messages });

  await idb.set(cacheKey, response);
  return response;
}

export async function aiJson<T extends object>(
  ctx: ProjectContext,
  model: "gpt4o",
  schema: z.ZodSchema<T>,
  prompt: string,
  data: string,
): Promise<T> {
  const jsonSchema = zodToJsonSchema(schema, "S").definitions?.S;

  const cacheKey = `aicache:${model}-${await generateCacheKey({ jsonSchema, prompt, data })}`;
  const cachedValue = await idb.get(cacheKey);
  if (cachedValue) return cachedValue;

  const response = await ctx.trpcClient.ai.json.mutate({
    model,
    schema: jsonSchema as Record<string, unknown>,
    prompt,
    data,
  });
  const parsedResponse = schema.parse(response);

  await idb.set(cacheKey, parsedResponse);
  return parsedResponse;
}
