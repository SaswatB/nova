import Anthropic from "@anthropic-ai/sdk";
import { GenerativeModel, GoogleGenerativeAI, Part } from "@google/generative-ai";
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

const MessageSchema = z.union([
  z.object({
    role: z.enum(["user"]),
    content: z.union([
      z.string(),
      z.array(
        z.union([
          z.object({ type: z.literal("text"), text: z.string() }),
          z.object({ type: z.literal("image_url"), image_url: z.object({ url: z.string().url() }) }), // lm_1b1492dd9c currently only supports base64 jpegs
        ]),
      ),
    ]),
  }),
  z.object({ role: z.enum(["assistant"]), content: z.string() }),
]);
type Message = z.infer<typeof MessageSchema>;

export const aiRouter = router({
  chat: procedure
    .input(
      z.object({
        model: z.enum(["groq", "gpt4o", "opus", "sonnet", "gemini", "geminiFlash"]),
        system: z.string(),
        messages: MessageSchema.array(),
      }),
    )
    .mutation(async ({ input }) => {
      return (
        match(input.model)
          // .with("groq", () => groqChat(input.system, input.messages))
          .with("groq", () => {
            throw new Error("Groq is not supported");
          })
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
          .exhaustive()
      );
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
  generateShortName: procedure.input(z.object({ goal: z.string() })).mutation(async ({ input }) => {
    const prompt = `Generate a short, catchy name (max 3 words) for a project space with the following goal: "${input.goal}"`;
    const shortName = await openai.chat("", [{ role: "user", content: prompt }]);
    return shortName.trim().replace(/^("|\*+)|("|\*+)$/g, "");
  }),
});

// const groq = new Groq({ apiKey: env.GROQ_API_KEY });
// // const groq = new OpenAI({ apiKey: env.VITE_TOGETHERAI_API_KEY, baseURL: "https://api.together.xyz/v1" });
// async function groqChat(system: string, messages: Message[]): Promise<string> {
//   const result = await groq.chat.completions.create({
//     model: "llama3-70b-8192",
//     // model: "meta-llama/Llama-3-70b-chat-hf",
//     messages: [{ role: "system", content: system }, ...messages],
//   });
//   return result.choices[0]?.message.content ?? "";
// }

const anthropic = new Anthropic({ apiKey: env.CLAUDE_API_KEY });
async function claudeChat(model: "opus" | "sonnet", system: string, messages: Message[]): Promise<string> {
  const response = await anthropic.messages.create({
    model: model === "opus" ? "claude-3-opus-20240229" : "claude-3-5-sonnet-20240620",
    max_tokens: 4096,
    system,
    messages: messages.map((m) =>
      m.role === "assistant"
        ? {
            role: "assistant",
            content: m.content,
          }
        : {
            role: "user",
            content:
              typeof m.content === "string"
                ? m.content
                : m.content.map((c) =>
                    c.type === "text"
                      ? c
                      : // lm_1b1492dd9c currently only supports base64 jpegs
                        {
                          type: "image",
                          source: { type: "base64", data: c.image_url.url.split(",")[1]!, media_type: "image/jpeg" },
                        },
                  ),
          },
    ),
  });
  const message = response.content[0];
  return (message?.type === "text" && message?.text) || "";
}

const googleGenAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
async function geminiChat(model: GenerativeModel, system: string, messages: Message[]) {
  function messageToParts(m: Message): Part[] {
    if (typeof m.content === "string") return [{ text: m.content }];
    return m.content.map((c) =>
      c.type === "text"
        ? { text: c.text }
        : // lm_1b1492dd9c currently only supports base64 jpegs
          { inlineData: { data: c.image_url.url.split(",")[1]!, mimeType: "image/jpeg" } },
    );
  }

  const chat = model.startChat({
    history: [
      { role: "user", parts: [{ text: system }] },
      { role: "model", parts: [{ text: "Understood." }] },
      ...messages.slice(0, -1).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: messageToParts(m),
      })),
    ],
  });
  const result = await chat.sendMessage(messageToParts(messages.at(-1)!));
  return result.response.text();
}
const gemini = googleGenAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
const geminiFlash = googleGenAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
