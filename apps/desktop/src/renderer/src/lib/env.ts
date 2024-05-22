import { z } from "zod";

export const env = z
  .object({
    VITE_CLAUDE_API_KEY: z.string(),
    VITE_ENABLE_STT: z.boolean().optional(),
    VITE_GEMINI_API_KEY: z.string(),
    VITE_GROQ_API_KEY: z.string(),
    VITE_OPENAI_API_KEY: z.string(),
    VITE_TOGETHERAI_API_KEY: z.string(),
  })
  .parse(import.meta.env);
