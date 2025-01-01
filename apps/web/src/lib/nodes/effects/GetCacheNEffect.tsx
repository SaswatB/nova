import { SwNodeRunnerContextType } from "streamweave-core";
import { z } from "zod";

import { swEffect } from "../swEffect";

export const GetCacheNEffect = swEffect.runnable((key: string, { effectContext }) =>
  effectContext.projectCacheGet(key),
);

export async function getCacheParsed<T extends unknown>(
  nrc: SwNodeRunnerContextType<{ getCache: typeof GetCacheNEffect }>,
  key: string,
  schema: z.ZodSchema<T>,
): Promise<T | undefined> {
  const value = await nrc.effects.getCache(key);
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}
