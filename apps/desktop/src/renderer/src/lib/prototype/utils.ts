import Anthropic from "@anthropic-ai/sdk";
import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import { createHash } from "crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import Groq from "groq-sdk";
import { Draft, produce } from "immer";
import OpenAI from "openai";
import { join } from "path";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import { env } from "../env";

const CACHE_DIR = join(__dirname, "cache");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

export function getDb<T extends object>(filename: string = "db.json", schema: z.ZodSchema<T>, defaultState: T) {
  const flush = (s: T, saveFilename = filename) => {
    console.log("flushing", s, saveFilename, JSON.stringify(s, null, 2));
    writeFileSync(saveFilename, JSON.stringify(s, null, 2));
  };

  let state: T;
  try {
    state = schema.parse(JSON.parse(readFileSync(filename, "utf-8")));
  } catch (e) {
    state = defaultState;
  }
  // flush(state, filename.replace(".json", `-${Date.now()}.json`));
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "update")
          return (callback: (s: Draft<T>) => void) => {
            const newState = produce(state, callback);
            state = newState;
            flush(newState, filename);
          };
        return (state as any)[prop];
      },
    },
  ) as T & { update: (callback: (s: Draft<T>) => void) => void };
}

export function readFilesRecursively(dir: string): { path: string; content: string }[] {
  let files: { path: string; content: string }[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files = files.concat(readFilesRecursively(fullPath));
    } else {
      files.push({ path: fullPath, content: readFileSync(fullPath, "utf-8") });
    }
  }

  return files;
}

export function removeKey(obj: object, keyName: string): object {
  if (Array.isArray(obj)) {
    return obj.map((item) => removeKey(item, keyName));
  } else if (obj !== null && typeof obj === "object") {
    const newObj = {};
    for (const key in obj) {
      if (key !== keyName) {
        (newObj as any)[key] = removeKey((obj as any)[key], keyName);
      }
    }
    return newObj;
  }
  return obj;
}

const groq = new Groq({ apiKey: env.VITE_GROQ_API_KEY });
async function groqChat(system: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const result = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    messages: [{ role: "system", content: system }, ...messages],
  });
  return result.choices[0].message.content;
}

const openai = new OpenAI({ apiKey: env.VITE_OPENAI_API_KEY });
async function openaiChat(system: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const result = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: system }, ...messages],
  });
  return result.choices[0].message.content ?? "";
}
export async function openaiJson<T extends object>(schema: z.ZodSchema<T>, prompt: string, data: string) {
  const result = await openai.chat.completions.create({
    model: "gpt-4o",
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
  const out = result.choices[0].message.tool_calls?.[0].function?.arguments ?? "{}";
  return schema.parse(JSON.parse(out));
}

const claude = new Anthropic({ apiKey: env.VITE_CLAUDE_API_KEY });
async function claudeChat(system: string, messages: { role: "user" | "assistant"; content: string }[]) {
  const message = await claude.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
    system,
    messages,
  });
  return message.content[0].text;
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
  const out = result.content.find((m: any) => m.type === "tool_use").input;
  return schema.parse(out);
}

const googleGenAI = new GoogleGenerativeAI(env.VITE_GEMINI_API_KEY);
async function geminiChat(
  model: GenerativeModel,
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
) {
  const chat = model.startChat({
    systemInstruction: system,
    history: messages
      .slice(0, -1)
      .map((m) => ({ role: m.role === "user" ? "user" : "model", parts: [{ text: m.content }] })),
  });
  const result = await chat.sendMessage(messages.at(-1)!.content);
  return result.response.text();
}
const gemini = googleGenAI.getGenerativeModel({ model: "gemini-1.5-pro" });
const geminiFlash = googleGenAI.getGenerativeModel({ model: "gemini-1.5-flash" });

function generateCacheKey(obj: object): string {
  const hash = createHash("sha256");
  hash.update(JSON.stringify(obj));
  return hash.digest("hex");
}

export async function aiChat(
  model: "groq" | "gpt4o" | "opus" | "gemini" | "geminiFlash",
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const cacheKey = generateCacheKey({ system, messages });
  const cachePath = join(CACHE_DIR, `${model}-${cacheKey}.json`);

  if (existsSync(cachePath)) {
    const cachedData = JSON.parse(readFileSync(cachePath, "utf-8"));
    return cachedData.response;
  }

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
      response = await geminiChat(gemini, system, messages);
      break;
    case "geminiFlash":
      response = await geminiChat(geminiFlash, system, messages);
      break;
    default:
      throw new Error("Invalid model name");
  }

  writeFileSync(cachePath, JSON.stringify({ model, system, messages, response, timestamp: Date.now() }, null, 2));

  return response;
}
