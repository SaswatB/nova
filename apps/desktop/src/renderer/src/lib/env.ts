import { z } from "zod";

export const env = z
  .object({
    VITE_CLAUDE_API_KEY: z.string(),
    VITE_GEMINI_API_KEY: z.string(),
    VITE_GROQ_API_KEY: z.string(),
    VITE_OPENAI_API_KEY: z.string(),
    VITE_ENABLE_STT: z.boolean().optional(),
  })
  .parse(import.meta.env);
