import { SwNodeRunnerContextType } from "streamweave-core";
import { z } from "zod";

import { swEffect } from "../swEffect";

export const GetCacheNEffect = swEffect.runnable(
  (key: string, { effectContext }) => effectContext.projectCacheGet(key),
  // renderRequestTrace: (key) => (
  //   <Flex gap="4">
  //     <span>Key:</span>
  //     <code>{key}</code>
  //   </Flex>
  // ),
  // renderResultTrace: (result, key) => renderJsonWell(`Get Cache Result ${key}`, result),
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
