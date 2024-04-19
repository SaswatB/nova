import { z } from "zod";

export const env = z
  .object({
    DEV: z.boolean(),
    PROD: z.boolean(),
    VITE_CLAUDE_API_KEY: z.string(),
    VITE_GROQ_API_KEY: z.string(),
  })
  .parse(import.meta.env);
