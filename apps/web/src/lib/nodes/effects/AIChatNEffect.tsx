import { aiChatImpl, Message, Model } from "@repo/shared";

import { SYSTEM_PROMPT } from "../../constants";
import { throwError } from "../../err";
import { getLocalStorage } from "../../hooks/useLocalStorage";
import { lsKey } from "../../keys";
import { swEffect } from "../swEffect";

const formatMessages = (messages: Message[] | [string]) => {
  return typeof messages[0] === "string" ? [{ role: "user" as const, content: messages[0] }] : (messages as Message[]);
};

export const AIChatNEffect = swEffect
  .runnableAnd(
    async ({ model, messages }: { model: Model; messages: Message[] | [string] }, { effectContext, signal }) => {
      const args = { model, system: SYSTEM_PROMPT, messages: formatMessages(messages) };
      if (getLocalStorage(lsKey.localModeEnabled, false)) {
        const apiKeys = getLocalStorage(lsKey.localModeSettings, {}).apiKeys || throwError("No API keys set");
        return aiChatImpl({ ...args, signal, apiKeys });
      }
      return effectContext.trpcClient.ai.chat.mutate(args, { signal });
    },
  )
  .callAliasAnd((model: Model, messages: Message[] | [string]) => ({ model, messages }))
  .cacheable();

//   renderRequestTrace({ model, messages }) {
//     const formattedMessages = formatMessages(messages);
//     return (
//       <>
//         <Flex gap="4">
//           <span>Model:</span>
//           <code>{model}</code>
//         </Flex>
//         {formattedMessages.map((m, i) => (
//           <Well key={i} title={startCase(m.role)} markdownPreferred>
//             {/* todo proper image support */}
//             {typeof m.content === "string"
//               ? m.content
//               : m.content.map((c) => (c.type === "text" ? c.text : "<image>")).join("\n")}
//           </Well>
//         ))}
//       </>
//     );
//   },
//   renderResultTrace(result: string) {
//     return (
//       <Well title="AI Chat Response" markdownPreferred>
//         {result}
//       </Well>
//     );
//   },
// },
