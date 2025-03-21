import { z } from "zod";
import { zerialize } from "zodex";

import { aiJsonImpl, Model } from "@repo/shared";

import { throwError } from "../../../../../../packages/streamweave-core/src/lib/err";
import { SYSTEM_PROMPT } from "../../constants";
import { getLocalStorage } from "../../hooks/useLocalStorage";
import { lsKey } from "../../keys";
import { swEffect } from "../swEffect";

const DEFAULT_MODEL: Model = "gpt4o";

export const AIJsonNEffect = swEffect
  .runnableAnd(
    async (
      {
        model = DEFAULT_MODEL,
        zSchema,
        data,
        prompt = SYSTEM_PROMPT,
      }: { model?: Model; zSchema: Record<string, unknown>; data: string; prompt?: string },
      { effectContext, signal },
    ) => {
      const args = { model, schema: zSchema, data: `${prompt}\n\n${data}` };
      if (getLocalStorage(lsKey.localModeEnabled, false)) {
        return aiJsonImpl({
          ...args,
          signal,
          apiKeys: getLocalStorage(lsKey.localModeSettings, {}).apiKeys || throwError("No API keys set"),
        });
      }
      return effectContext.trpcClient.ai.json.mutate(args, { signal });
    },
  )
  .wrapAnd(
    (runEffect) =>
      async <T extends unknown>({
        schema,
        ...rest
      }: {
        schema: z.ZodSchema<T>;
        data: string;
        model?: Model;
        prompt?: string;
      }): Promise<T | undefined> => {
        // this is breaking typescript, so use any to disable typechecking
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value = await runEffect({ zSchema: (zerialize as any)(schema), ...rest });
        const result = schema.safeParse(value);
        return result.success ? result.data : undefined;
      },
  )
  .cacheable();
