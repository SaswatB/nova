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
export type AIChatOptions = z.infer<typeof AIChatOptionsSchema> & { signal?: AbortSignal };

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
export type AIJsonOptions = z.infer<typeof AIJsonOptionsSchema> & { signal?: AbortSignal };

export function aiJsonImpl(options: AIJsonOptions) {
  return openAiJson(options);
}

let openai: OpenAI | undefined;
async function openAiChat({ model, system, messages, apiKeys, signal }: AIChatOptions & { model: "gpt4o" }) {
  const { openai: apiKey } = apiKeys;
  if (!openai || openai.apiKey !== apiKey) openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const result = await openai.chat.completions.create(
    {
      model: match(model)
        .with("gpt4o", () => "gpt-4o")
        .exhaustive(),
      messages: [...(system ? [{ role: "system" as const, content: system }] : []), ...messages],
    },
    { signal },
  );
  return result.choices[0]?.message.content ?? "";
}

async function openAiJson({ model, schema, prompt, data, apiKeys, signal }: AIJsonOptions & { model: "gpt4o" }) {
  const { openai: apiKey } = apiKeys;
  if (!openai || openai.apiKey !== apiKey) openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const result = await openai.chat.completions.create(
    {
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
    },
    { signal },
  );

  try {
    const out = result.choices[0]?.message.tool_calls?.[0]?.function?.arguments ?? "{}";
    return JSON.parse(out);
  } catch (error) {
    console.error("Failed to parse output", error, result);
    throw error;
  }
}

declare const window: {} | undefined;

let anthropic: Anthropic | undefined;
async function claudeChat({
  model,
  system,
  messages,
  apiKeys,
  signal,
}: AIChatOptions & { model: "opus" | "sonnet" }): Promise<string> {
  const { anthropic: apiKey } = apiKeys;
  if (!anthropic || anthropic.apiKey !== apiKey)
    anthropic = new Anthropic({
      apiKey,
      baseURL: typeof window !== "undefined" ? "http://localhost:8010/proxy" : undefined,
    });

  const maxAttempts = 3;
  let attempt = 0;
  let fullResponse = "";

  while (attempt < maxAttempts) {
    const response = await anthropic.messages.create(
      {
        model: match(model)
          .with("opus", () => "claude-3-opus-20240229")
          .with("sonnet", () => "claude-3-5-sonnet-20240620")
          .exhaustive(),
        max_tokens: 4096,
        system,
        messages: [
          ...messages.map((m) =>
            m.role === "assistant"
              ? {
                  role: "assistant" as const,
                  content: m.content,
                }
              : {
                  role: "user" as const,
                  content:
                    typeof m.content === "string"
                      ? m.content
                      : m.content.map((c) =>
                          c.type === "text"
                            ? c
                            : {
                                // lm_1b1492dd9c currently only supports base64 jpegs
                                type: "image" as const,
                                source: {
                                  type: "base64" as const,
                                  data: c.image_url.url.split(",")[1]!,
                                  media_type: "image/jpeg" as const,
                                },
                              },
                        ),
                },
          ),
          ...(fullResponse ? [{ role: "assistant" as const, content: fullResponse }] : []),
        ],
      },
      { signal },
    );

    const message = response.content[0];
    if (message?.type === "text") {
      fullResponse += message.text;
      if (!response.stop_reason || response.stop_reason !== "max_tokens" || attempt === maxAttempts - 1) {
        return fullResponse;
      } else {
        console.warn("Max tokens reached, continuing...");
      }
    }

    attempt++;
  }

  // should never reach
  throw new Error("Max attempts reached. Failed to get complete response.");
}

let googleGenAI: GoogleGenerativeAI | undefined;
let gemini: GenerativeModel | undefined;
let geminiFlash: GenerativeModel | undefined;
async function geminiChat({
  model,
  system,
  messages,
  apiKeys,
  signal, // google doesn't seem to support aborting requests
}: AIChatOptions & { model: "gemini" | "geminiFlash" }) {
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
  const maxAttempts = 5;
  let attempt = 0;
  let fullResponse = "";

  while (attempt < maxAttempts) {
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
    fullResponse += result.response.text();

    if (
      !result.response.candidates?.[0]?.finishReason ||
      result.response.candidates[0].finishReason !== "MAX_TOKENS" ||
      attempt === maxAttempts - 1
    ) {
      return fullResponse;
    } else {
      if (signal?.aborted) throw new Error("Aborted");

      console.warn("Max tokens reached, continuing...");
      // Append the last message with the current response to continue the conversation
      messages.push({ role: "assistant", content: fullResponse });
    }

    attempt++;
  }

  throw new Error("Max attempts reached. Failed to get complete response.");
}
