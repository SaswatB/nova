import { startCase } from "lodash";
import { SwEffectParam, SwEffectResult } from "streamweave-core";
import { Flex } from "styled-system/jsx";

import { Well } from "../../../components/base/Well";
import { AIChatNEffect, formatAIChatNEffectMessages } from "./AIChatNEffect";

export const AIChatNEffectRender = {
  renderRequestTrace({ model, messages }: SwEffectParam<typeof AIChatNEffect>) {
    return (
      <>
        <Flex gap="4">
          <span>Model:</span>
          <code>{model}</code>
        </Flex>
        {formatAIChatNEffectMessages(messages).map((m, i) => (
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

  renderResultTrace(result: SwEffectResult<typeof AIChatNEffect>) {
    return (
      <Well title="AI Chat Response" markdownPreferred>
        {result}
      </Well>
    );
  },
};
