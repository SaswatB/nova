import * as idb from "idb-keyval";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import { ProjectContext } from "./nodes/node-types";

async function generateCacheKey(obj: object): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(obj));
  const hash = await crypto.subtle.digest("SHA-256", data);
  const hexCodes = [];
  const view = new DataView(hash);
  for (let i = 0; i < view.byteLength; i += 4) {
    const value = view.getUint32(i);
    const stringValue = value.toString(16);
    const padding = "00000000";
    const paddedValue = (padding + stringValue).slice(-padding.length);
    hexCodes.push(paddedValue);
  }
  return hexCodes.join("");
}

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
