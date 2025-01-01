import { aiChatImpl, Message, Model } from "@repo/shared";

import { SYSTEM_PROMPT } from "../../constants";
import { throwError } from "../../err";
import { getLocalStorage } from "../../hooks/useLocalStorage";
import { lsKey } from "../../keys";
import { swEffect } from "../swEffect";

export const formatAIChatNEffectMessages = (messages: Message[] | [string]) => {
  return typeof messages[0] === "string" ? [{ role: "user" as const, content: messages[0] }] : (messages as Message[]);
};

export const AIChatNEffect = swEffect
  .runnableAnd(
    async ({ model, messages }: { model: Model; messages: Message[] | [string] }, { effectContext, signal }) => {
      const args = { model, system: SYSTEM_PROMPT, messages: formatAIChatNEffectMessages(messages) };
      if (getLocalStorage(lsKey.localModeEnabled, false)) {
        const apiKeys = getLocalStorage(lsKey.localModeSettings, {}).apiKeys || throwError("No API keys set");
        return aiChatImpl({ ...args, signal, apiKeys });
      }
      return effectContext.trpcClient.ai.chat.mutate(args, { signal });
    },
  )
  .callAliasAnd((model: Model, messages: Message[] | [string]) => ({ model, messages }))
  .cacheable();
