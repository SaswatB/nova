import Anthropic from "@anthropic-ai/sdk";
import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import * as idb from "idb-keyval";
import OpenAI from "openai";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import { env } from "../env";

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

const groq = new Groq({ apiKey: env.VITE_GROQ_API_KEY, dangerouslyAllowBrowser: true });
// const groq = new OpenAI({ apiKey: env.VITE_TOGETHERAI_API_KEY, baseURL: "https://api.together.xyz/v1" });
async function groqChat(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const result = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    // model: "meta-llama/Llama-3-70b-chat-hf",
    messages: [{ role: "system", content: system }, ...messages],
  });
  return result.choices[0]?.message.content ?? "";
}

const openai = new OpenAI({ apiKey: env.VITE_OPENAI_API_KEY, dangerouslyAllowBrowser: true });
async function openaiChat(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const result = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: system }, ...messages],
  });
  return result.choices[0]?.message.content ?? "";
}
export async function openaiJson<T extends object>(schema: z.ZodSchema<T>, prompt: string, data: string) {
  const result = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      { role: "system", content: `Please format the given data to fit the schema.\n${prompt}`.trim() },
      { role: "user", content: data },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "resolve",
          description: "Resolve the formatted data",
          parameters: zodToJsonSchema(schema, "S").definitions?.S,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "resolve" } },
  });
  const out = result.choices[0]?.message.tool_calls?.[0]?.function?.arguments ?? "{}";
  return schema.parse(JSON.parse(out));
}

const anthropic = new Anthropic({ apiKey: env.VITE_CLAUDE_API_KEY });
async function claudeChat(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const message = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
    system,
    messages,
  });
  return message.content[0]?.text ?? "";
}
export async function claudeJson<T extends object>(schema: z.ZodSchema<T>, prompt: string, data: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.VITE_CLAUDE_API_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "tools-2024-05-16",
    },
    body: JSON.stringify({
      model: "claude-3-haiku-20240307",
      max_tokens: 4000,
      system: `Please format the given data to fit the schema.\n${prompt}`.trim(),
      messages: [{ role: "user", content: data }],
      tools: [
        {
          name: "saveData",
          description: "Save the formatted data",
          input_schema: zodToJsonSchema(schema, "S").definitions?.S,
        },
      ],
    }),
  });

  const result = await response.json();
  const out = result.content.find((m: { type: string }) => m.type === "tool_use").input;
  return schema.parse(out);
}

const googleGenAI = new GoogleGenerativeAI(env.VITE_GEMINI_API_KEY);
async function geminiChat(
  model: GenerativeModel,
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
) {
  const chat = model.startChat({
    // systemInstruction: system,
    history: [
      { role: "user", parts: [{ text: system }] },
      { role: "model", parts: [{ text: "Understood." }] },
      ...messages
        .slice(0, -1)
        .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
    ],
  });
  const result = await chat.sendMessage(messages.at(-1)!.content);
  return result.response.text();
}
const gemini = googleGenAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
const geminiFlash = googleGenAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

export async function aiChat(
  model: "groq" | "gpt4o" | "opus" | "gemini" | "geminiFlash",
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const cacheKey = `aicache:${model}-${await generateCacheKey({ system, messages })}`;

  const cachedValue = await idb.get(cacheKey);
  if (cachedValue) return cachedValue;

  let response: string;
  switch (model) {
    case "groq":
      response = await groqChat(system, messages);
      break;
    case "gpt4o":
      response = await openaiChat(system, messages);
      break;
    case "opus":
      response = await claudeChat(system, messages);
      break;
    case "gemini":
      try {
        response = await geminiChat(gemini, system, messages);
      } catch (error) {
        console.error("Failed to use gemini, falling back to gpt4o", error);
        response = await openaiChat(system, messages);
      }
      break;
    case "geminiFlash":
      try {
        response = await geminiChat(geminiFlash, system, messages);
      } catch (error) {
        console.error("Failed to use geminiFlash, falling back to gpt4o", error);
        response = await openaiChat(system, messages);
      }
      break;
    default:
      throw new Error("Invalid model name");
  }

  await idb.set(cacheKey, response);
  return response;
}
