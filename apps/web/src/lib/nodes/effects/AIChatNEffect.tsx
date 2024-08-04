import { Flex } from "@radix-ui/themes";
import { startCase } from "lodash";

import { aiChatImpl, Message, Model } from "@repo/shared";

import { Well } from "../../../components/base/Well";
import { SYSTEM_PROMPT } from "../../constants";
import { throwError } from "../../err";
import { getLocalStorage } from "../../hooks/useLocalStorage";
import { lsKey } from "../../keys";
import { createNodeEffect } from "../effect-types";
import { NodeRunnerContext } from "../node-types";

const formatMessages = (messages: Message[] | [string]) => {
  return typeof messages[0] === "string" ? [{ role: "user" as const, content: messages[0] }] : (messages as Message[]);
};

export const AIChatNEffect = createNodeEffect(
  { typeId: "ai-chat", cacheable: true },
  {
    async run({ model, messages }: { model: Model; messages: Message[] | [string] }, { projectContext, signal }) {
      const args = { model, system: SYSTEM_PROMPT, messages: formatMessages(messages) };
      if (getLocalStorage(lsKey.localModeEnabled, false)) {
        const apiKeys = getLocalStorage(lsKey.localModeSettings, {}).apiKeys || throwError("No API keys set");
        return aiChatImpl({ ...args, signal, apiKeys });
      }
      return projectContext.trpcClient.ai.chat.mutate(args, { signal });
    },
    renderRequestTrace({ model, messages }) {
      const formattedMessages = formatMessages(messages);
      return (
        <>
          <Flex gap="4">
            <span>Model:</span>
            <code>{model}</code>
          </Flex>
          {formattedMessages.map((m, i) => (
            <Well key={i} title={startCase(m.role)} markdownPreferred>
              {/* todo proper image support */}
              {typeof m.content === "string"
                ? m.content
                : m.content.map((c) => (c.type === "text" ? c.text : "<image>")).join("\n")}
            </Well>
          ))}
        </>
      );
    },
    renderResultTrace(result: string) {
      return (
        <Well title="AI Chat Response" markdownPreferred>
          {result}
        </Well>
      );
    },
  },
  (nrc: NodeRunnerContext, model: Model, messages: Message[] | [string]) => nrc.e$(AIChatNEffect, { model, messages }),
);
