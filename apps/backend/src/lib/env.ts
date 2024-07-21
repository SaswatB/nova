import { z } from "zod";

export const env = z
  .object({
    DOPPLER_ENVIRONMENT: z.union([z.literal("dev"), z.literal("stg"), z.literal("prd")]),
    BENCH_API_TOKEN: z.string(),
    BROWSERLESS_API_KEY: z.string(),
    CLAUDE_API_KEY: z.string(),
    CLERK_PUBLISHABLE_KEY: z.string(),
    CLERK_SECRET_KEY: z.string(),
    HUME_API_KEY: z.string(),
    HUME_CLIENT_SECRET: z.string(),
    GEMINI_API_KEY: z.string(),
    GOOGLESEARCH_API_KEY: z.string(),
    // GROQ_API_KEY: z.string(),
    OPENAI_API_KEY: z.string(),
    PORT: z.string().optional(),
    // TOGETHERAI_API_KEY: z.string(),
  })
  .parse(process.env);

export const aiApiKeys = { anthropic: env.CLAUDE_API_KEY, googleGenAI: env.GEMINI_API_KEY, openai: env.OPENAI_API_KEY };
