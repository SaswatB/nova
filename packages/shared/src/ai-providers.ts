import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, generateText } from "ai";
import { match } from "ts-pattern";
import { z } from "zod";
import { dezerialize, SzType } from "zodex";

declare const window: {} | undefined;

const ApiKeysSchema = z.object({ openai: z.string(), anthropic: z.string(), googleGenAI: z.string() });

enum Provider {
  OpenAI = "openai",
  Anthropic = "anthropic",
  Google = "google",
}

const models = {
  gpt4o: { provider: Provider.OpenAI, modelId: "gpt-4o" },
  gpt4oMini: { provider: Provider.OpenAI, modelId: "gpt-4o-mini" },
  opus: { provider: Provider.Anthropic, modelId: "claude-3-opus-20240229" },
  sonnet: { provider: Provider.Anthropic, modelId: "claude-3-5-sonnet-20240620" },
  gemini: { provider: Provider.Google, modelId: "models/gemini-1.5-pro-latest" },
  geminiFlash: { provider: Provider.Google, modelId: "models/gemini-1.5-flash-latest" },
};
export const ModelSchema = z.enum(Object.keys(models) as [keyof typeof models, ...(keyof typeof models)[]]);
export type Model = z.infer<typeof ModelSchema>;

function getModel(model: (typeof models)[keyof typeof models], apiKeys: AIChatOptions["apiKeys"]) {
  return match(model)
    .with({ provider: Provider.OpenAI }, ({ modelId }) => createOpenAI({ apiKey: apiKeys.openai })(modelId))
    .with({ provider: Provider.Anthropic }, ({ modelId }) =>
      createAnthropic({
        apiKey: apiKeys.anthropic,
        // lm_44f7499466 anthropic disabled cors so this workaround is needed
        baseURL: typeof window !== "undefined" ? "http://localhost:8010/proxy" : undefined,
      })(modelId),
    )
    .with({ provider: Provider.Google }, ({ modelId }) =>
      createGoogleGenerativeAI({ apiKey: apiKeys.googleGenAI })(modelId),
    )
    .exhaustive();
}

export const MessageSchema = z.union([
  z.object({
    role: z.enum(["user"]),
    content: z.union([
      z.string(),
      z.array(
        z.union([
          z.object({ type: z.literal("text"), text: z.string() }),
          // lm_1b1492dd9c currently only supports base64 jpegs
          z.object({ type: z.literal("image"), image: z.string() }),
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
  apiKeys: ApiKeysSchema,
});
export type AIChatOptions = z.infer<typeof AIChatOptionsSchema> & { signal?: AbortSignal };

export async function aiChatImpl(options: AIChatOptions) {
  let fullText = "";
  for (let i = 0; i < 5; i++) {
    fullText = fullText.trimEnd(); // anthropic throws an error on trailing whitespace
    const result = await generateText({
      model: getModel(models[options.model], options.apiKeys),
      system: options.system,
      messages: [...options.messages, ...(fullText ? [{ role: "assistant" as const, content: fullText }] : [])],
      abortSignal: options.signal,
    });
    fullText += result.text;

    if (result.finishReason !== "length" || options.signal?.aborted) break;
  }

  return fullText;
}

export const AIJsonOptionsSchema = z.object({
  model: ModelSchema,
  schema: z.record(z.unknown()), // zodex
  system: z.string().optional(),
  data: z.string(),
  apiKeys: ApiKeysSchema,
});
export type AIJsonOptions = z.infer<typeof AIJsonOptionsSchema> & { signal?: AbortSignal };

export async function aiJsonImpl(options: AIJsonOptions) {
  const result = await generateObject({
    model: getModel(models[options.model], options.apiKeys),
    schema: dezerialize(options.schema as SzType),
    system: options.system,
    prompt: options.data,
    abortSignal: options.signal,
  });
  return result.object;
}
