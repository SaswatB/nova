import { Flex } from "@radix-ui/themes";
import { z } from "zod";

import { renderJsonWell } from "../../../components/base/Well";
import { createNodeEffect } from "../effect-types";
import { NodeRunnerContext } from "../node-types";

export const GetCacheNEffect = createNodeEffect(
  "get-cache",
  {
    run: (key: string, { projectContext }) => projectContext.projectCacheGet(key),
    renderRequestTrace: (key) => (
      <Flex gap="4">
        <span>Key:</span>
        <code>{key}</code>
      </Flex>
    ),
    renderResultTrace: (result, key) => renderJsonWell(`Get Cache Result ${key}`, result),
  },
  async <T extends unknown>(nrc: NodeRunnerContext, key: string, schema: z.ZodSchema<T>): Promise<T | undefined> => {
    const value = await nrc.e$(GetCacheNEffect, key);
    const result = schema.safeParse(value);
    return result.success ? result.data : undefined;
  },
);
