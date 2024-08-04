import { Flex } from "styled-system/jsx";
import { z } from "zod";
import { zerialize } from "zodex";

import { aiJsonImpl, Model } from "@repo/shared";

import { renderJsonWell, Well } from "../../../components/base/Well";
import { SYSTEM_PROMPT } from "../../constants";
import { throwError } from "../../err";
import { getLocalStorage } from "../../hooks/useLocalStorage";
import { lsKey } from "../../keys";
import { createNodeEffect } from "../effect-types";
import { NodeRunnerContext } from "../node-types";

const DEFAULT_MODEL: Model = "gpt4o";

export const AIJsonNEffect = createNodeEffect(
  { typeId: "ai-json", cacheable: true },
  {
    async run(
      {
        model = DEFAULT_MODEL,
        zSchema,
        data,
        prompt = SYSTEM_PROMPT,
      }: { model?: Model; zSchema: Record<string, unknown>; data: string; prompt?: string },
      { projectContext, signal },
    ) {
      const args = { model, schema: zSchema, data: `${prompt}\n\n${data}` };
      if (getLocalStorage(lsKey.localModeEnabled, false)) {
        return aiJsonImpl({
          ...args,
          signal,
          apiKeys: getLocalStorage(lsKey.localModeSettings, {}).apiKeys || throwError("No API keys set"),
        });
      }
      return projectContext.trpcClient.ai.json.mutate(args, { signal });
    },
    renderRequestTrace({ model, data, prompt }) {
      return (
        <>
          <Flex gap="4">
            <span>Model:</span>
            <code>{model || DEFAULT_MODEL}</code>
          </Flex>
          {prompt && prompt !== SYSTEM_PROMPT && (
            <Well title="Prompt" markdownPreferred>
              {prompt}
            </Well>
          )}
          <Well title="Input" markdownPreferred>
            {data}
          </Well>
        </>
      );
    },
    renderResultTrace: (result: unknown) => renderJsonWell("AI JSON Response", result),
  },
  async <T extends unknown>(
    nrc: NodeRunnerContext,
    { schema, ...rest }: { model?: Model; schema: z.ZodSchema<T>; data: string; prompt?: string },
  ): Promise<T> => {
    // this is breaking typescript, so use any to disable typechecking
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zSchema = (zerialize as any)(schema);
    const result = await nrc.e$(AIJsonNEffect, { ...rest, zSchema });
    return schema.parse(result);
  },
);
