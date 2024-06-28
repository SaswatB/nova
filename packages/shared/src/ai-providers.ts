import Anthropic from "@anthropic-ai/sdk";
import { GenerativeModel, GoogleGenerativeAI, InlineDataPart, Part, TextPart } from "@google/generative-ai";
import OpenAI from "openai";
import { match, P } from "ts-pattern";
import { z } from "zod";

export const ModelSchema = z.enum(["gpt4o", "opus", "sonnet", "gemini", "geminiFlash"]);
export type Model = z.infer<typeof ModelSchema>;

export const MessageSchema = z.union([
  z.object({
    role: z.enum(["user"]),
    content: z.union([
      z.string(),
      z.array(
        z.union([
          z.object({ type: z.literal("text"), text: z.string() }),
          z.object({
            type: z.literal("image_url"),
            image_url: z.object({ url: z.string().url() }),
          }), // lm_1b1492dd9c currently only supports base64 jpegs
        ]),
      ),
    ]),
  }),
  z.object({ role: z.enum(["assistant"]), content: z.string() }),
]);
export type Message = z.infer<typeof MessageSchema>;

export const AIChatOptionsSchema = z.object({
  model: ModelSchema,
  system: z.string().optional(),
  messages: z.array(MessageSchema),
  apiKeys: z.object({ openai: z.string(), anthropic: z.string(), googleGenAI: z.string() }),
});
export type AIChatOptions = z.infer<typeof AIChatOptionsSchema>;

export function aiChatImpl(options: AIChatOptions) {
  return match(options)
    .with({ model: "gpt4o" }, (o) => openAiChat(o))
    .with({ model: P.union("opus", "sonnet") }, (o) => claudeChat(o))
    .with({ model: P.union("gemini", "geminiFlash") }, (o) => geminiChat(o))
    .exhaustive();
}

export const AIJsonOptionsSchema = z.object({
  model: z.literal("gpt4o"),
  schema: z.record(z.unknown()),
  prompt: z.string().optional(),
  data: z.string(),
  apiKeys: z.object({ openai: z.string() }),
});
export type AIJsonOptions = z.infer<typeof AIJsonOptionsSchema>;

export function aiJsonImpl(options: AIJsonOptions) {
  return openAiJson(options);
}

let openai: OpenAI | undefined;
async function openAiChat({ model, system, messages, apiKeys }: AIChatOptions & { model: "gpt4o" }) {
  const { openai: apiKey } = apiKeys;
  if (!openai || openai.apiKey !== apiKey) openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const result = await openai.chat.completions.create({
    model: match(model)
      .with("gpt4o", () => "gpt-4o")
      .exhaustive(),
    messages: [...(system ? [{ role: "system" as const, content: system }] : []), ...messages],
  });
  return result.choices[0]?.message.content ?? "";
}

async function openAiJson({ model, schema, prompt, data, apiKeys }: AIJsonOptions & { model: "gpt4o" }) {
  const { openai: apiKey } = apiKeys;
  if (!openai || openai.apiKey !== apiKey) openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const result = await openai.chat.completions.create({
    model: match(model)
      .with("gpt4o", () => "gpt-4o")
      .exhaustive(),
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `Please format the given data to fit the schema.\n${prompt ?? ""}`.trim(),
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
    throw error;
  }
}

let anthropic: Anthropic | undefined;
async function claudeChat({
  model,
  system,
  messages,
  apiKeys,
}: AIChatOptions & {
  model: "opus" | "sonnet";
}): Promise<string> {
  const { anthropic: apiKey } = apiKeys;
  if (!anthropic || anthropic.apiKey !== apiKey) anthropic = new Anthropic({ apiKey });

  const response = await anthropic.messages.create({
    model: match(model)
      .with("opus", () => "claude-3-opus-20240229")
      .with("sonnet", () => "claude-3-5-sonnet-20240620")
      .exhaustive(),
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
                          source: {
                            type: "base64",
                            data: c.image_url.url.split(",")[1]!,
                            media_type: "image/jpeg",
                          },
                        },
                  ),
          },
    ),
  });
  const message = response.content[0];
  return (message?.type === "text" && message?.text) || "";
}

let googleGenAI: GoogleGenerativeAI | undefined;
let gemini: GenerativeModel | undefined;
let geminiFlash: GenerativeModel | undefined;
async function geminiChat({
  model,
  system,
  messages,
  apiKeys,
}: AIChatOptions & {
  model: "gemini" | "geminiFlash";
}) {
  const { googleGenAI: apiKey } = apiKeys;
  if (!googleGenAI || !gemini || !geminiFlash || googleGenAI.apiKey !== apiKey) {
    googleGenAI = new GoogleGenerativeAI(apiKey);
    gemini = googleGenAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
    geminiFlash = googleGenAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
  }
  const selectedModel = match(model)
    .with("gemini", () => gemini!)
    .with("geminiFlash", () => geminiFlash!)
    .exhaustive();

  function messageToParts(m: Message): Part[] {
    if (typeof m.content === "string") return [{ text: m.content }];
    return m.content.map((c): InlineDataPart | TextPart =>
      c.type === "text"
        ? { text: c.text }
        : // lm_1b1492dd9c currently only supports base64 jpegs
          {
            inlineData: {
              data: c.image_url.url.split(",")[1]!,
              mimeType: "image/jpeg",
            },
          },
    );
  }

  const chat = selectedModel.startChat({
    history: [
      ...(system
        ? [
            { role: "user", parts: [{ text: system }] },
            { role: "model", parts: [{ text: "Understood." }] },
          ]
        : []),
      ...messages.slice(0, -1).map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: messageToParts(m),
      })),
    ],
  });
  const result = await chat.sendMessage(messageToParts(messages.at(-1)!));
  return result.response.text();
}
