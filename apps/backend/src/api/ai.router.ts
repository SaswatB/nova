import Anthropic from "@anthropic-ai/sdk";
import { GenerativeModel, GoogleGenerativeAI } from "@google/generative-ai";
import Groq from "groq-sdk";
import { match, P } from "ts-pattern";
import { container } from "tsyringe";
import { z } from "zod";

import { GoogleService } from "../external/google.service";
import { OpenAIService } from "../external/openai.service";
import { ScraperService } from "../external/scraper.service";
import { env } from "../lib/env";
import { procedure, router } from "./meta/app-server";

const openai = container.resolve(OpenAIService);
const scraperService = container.resolve(ScraperService);
const googleService = container.resolve(GoogleService);

export const aiRouter = router({
  chat: procedure
    .input(
      z.object({
        model: z.enum(["groq", "gpt4o", "opus", "sonnet", "gemini", "geminiFlash"]),
        system: z.string(),
        messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })),
      }),
    )
    .mutation(async ({ input }) => {
      return match(input.model)
        .with("groq", () => groqChat(input.system, input.messages))
        .with("gpt4o", () => openai.chat(input.system, input.messages))
        .with(P.union("opus", "sonnet"), (model) => claudeChat(model, input.system, input.messages))
        .with(P.union("gemini", "geminiFlash"), async (model) => {
          const selectedModel = model === "gemini" ? gemini : geminiFlash;
          try {
            return await geminiChat(selectedModel, input.system, input.messages);
          } catch (error1) {
            console.error(`Failed to use ${model}, falling back to gpt4o`, error1);
            try {
              return await openai.chat(input.system, input.messages);
            } catch (error2) {
              console.error("Failed to use gpt4o, throwing original error", error2);
              throw error1;
            }
          }
        })
        .exhaustive();
    }),
  json: procedure
    .input(z.object({ model: z.enum(["gpt4o"]), schema: z.record(z.unknown()), prompt: z.string(), data: z.string() }))
    .mutation(({ input }) => openai.formatJson(input.schema, input.prompt, input.data)),
  webSearch: procedure
    .input(z.object({ query: z.string() }))
    .mutation(async ({ input }) => googleService.searchWeb(input.query)),
  scrape: procedure
    .input(z.object({ schema: z.record(z.unknown()), prompt: z.string(), url: z.string().url() }))
    .mutation(({ input }) => scraperService.scrapeWebsite(input.url, input.schema, input.prompt)),
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

const anthropic = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
async function claudeChat(
  model: "opus" | "sonnet",
  system: string,
  messages: { role: "user" | "assistant"; content: string }[],
): Promise<string> {
  const response = await anthropic.messages.create({
    model: model === "opus" ? "claude-3-opus-20240229" : "claude-3-5-sonnet-20240620",
    max_tokens: 4096,
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
