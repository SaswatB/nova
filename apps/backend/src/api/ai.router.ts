import Anthropic from "@anthropic-ai/sdk";
import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import { writeFileSync } from "fs";
import Groq from "groq-sdk";
import { match } from "ts-pattern";
import { container } from "tsyringe";
import { z } from "zod";

import { OpenAIService } from "../external/openai.service";
import { env } from "../lib/env";
import { procedure, router } from "./meta/app-server";

export const aiRouter = router({
  chat: procedure
    .input(
      z.object({
        model: z.enum(["groq", "gpt4o", "opus", "gemini", "geminiFlash"]),
        system: z.string(),
        messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      }),
    )
    .mutation(async ({ input }) => {
      return match(input.model)
        .with("groq", () => groqChat(input.system, input.messages))
        .with("gpt4o", () => openaiChat(input.system, input.messages))
        .with("opus", () => claudeChat(input.system, input.messages))
        .with("gemini", async () => {
          try {
            return await geminiChat(gemini, input.system, input.messages);
          } catch (error) {
            console.error("Failed to use gemini, falling back to gpt4o", error);
            return await openaiChat(input.system, input.messages);
          }
        })
        .with("geminiFlash", async () => {
          try {
            return await geminiChat(geminiFlash, input.system, input.messages);
          } catch (error) {
            console.error("Failed to use geminiFlash, falling back to gpt4o", error);
            return await openaiChat(input.system, input.messages);
          }
        })
        .exhaustive();
    }),
  json: procedure
    .input(
      z.object({
        model: z.enum(["gpt4o"]),
        schema: z.record(z.unknown()),
        prompt: z.string(),
        data: z.string(),
      }),
    )
    .mutation(async ({ input }) => openaiJson(input.schema, input.prompt, input.data)),
});

const groq = new Groq({ apiKey: env.GROQ_API_KEY });
// const groq = new OpenAI({ apiKey: env.VITE_TOGETHERAI_API_KEY, baseURL: "https://api.together.xyz/v1" });
async function groqChat(system: string, messages: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const result = await groq.chat.completions.create({
    model: "llama3-70b-8192",
    // model: "meta-llama/Llama-3-70b-chat-hf",
    messages: [{ role: "system", content: system }, ...messages],
  });
  return result.choices[0]?.message.content ?? "";
}

async function openaiChat(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const openai = container.resolve(OpenAIService);
  const result = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [{ role: "system", content: system }, ...messages],
  });
  return result.choices[0]?.message.content ?? "";
}
async function openaiJson(schema: Record<string, unknown>, prompt: string, data: string) {
  const openai = container.resolve(OpenAIService);
  const result = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `Please format the given data to fit the schema.\n${prompt}`.trim(),
      },
      { role: "user", content: data },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: "resolve",
          description: "Resolve the formatted data",
          parameters: schema,
        },
      },
    ],
    tool_choice: { type: "function", function: { name: "resolve" } },
  });
  try {
    const out = result.choices[0]?.message.tool_calls?.[0]?.function?.arguments ?? "{}";
    return JSON.parse(out);
  } catch (error) {
    console.error("Failed to parse output", error, result);
    if (env.DOPPLER_ENVIRONMENT === "dev") writeFileSync(`error-${Date.now()}.json`, JSON.stringify(result, null, 2));
    throw error;
  }
}

const anthropic = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
async function claudeChat(
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
    system,
    messages,
  });
  const message = response.content[0];
  return (message?.type === "text" && message?.text) || "";
}

const googleGenAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
async function geminiChat(
  model: GenerativeModel,
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
) {
  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: system }] },
      { role: "model", parts: [{ text: "Understood." }] },
      ...messages.slice(0, -1).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      })),
    ],
  });
  const result = await chat.sendMessage(messages.at(-1)!.content);
  return result.response.text();
}
const gemini = googleGenAI.getGenerativeModel({
  model: "gemini-1.5-pro-latest",
});
const geminiFlash = googleGenAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest",
});
