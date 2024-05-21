import { z } from "zod";

import { getDb } from "./utils";

const DbSchema = z.object({
  context: z
    .object({
      info: z.string(),
      tags: z.array(z.string()),
    })
    .array(),
});
const db = getDb("nova-dev.json", DbSchema, { context: [] });
