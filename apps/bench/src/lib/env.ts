import { z } from "zod";

export const env = z
  .object({
    BENCH_API_TOKEN: z.string(),
    API_URL: z.string(),
  })
  .parse(process.env);