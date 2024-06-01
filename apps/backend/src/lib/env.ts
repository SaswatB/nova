import { z } from "zod";

export const env = z
  .object({
    DOPPLER_ENVIRONMENT: z.union([
      z.literal("dev"),
      z.literal("stg"),
      z.literal("prd"),
    ]),
    CLAUDE_API_KEY: z.string(),
    CLERK_PUBLISHABLE_KEY: z.string(),
    CLERK_SECRET_KEY: z.string(),
    GEMINI_API_KEY: z.string(),
    GROQ_API_KEY: z.string(),
    OPENAI_API_KEY: z.string(),
    PORT: z.string().optional(),
    TOGETHERAI_API_KEY: z.string(),
  })
  .parse(process.env);
