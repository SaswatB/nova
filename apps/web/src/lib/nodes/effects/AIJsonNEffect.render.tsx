import { SwEffectParam, SwEffectResult } from "streamweave-core";
import { Flex } from "styled-system/jsx";

import { renderJsonWell, Well } from "../../../components/base/Well";
import { SYSTEM_PROMPT } from "../../constants";
import { AIJsonNEffect } from "./AIJsonNEffect";

export const AIJsonNEffectRender = {
  renderRequestTrace({ model, data, prompt }: SwEffectParam<typeof AIJsonNEffect>) {
    return (
      <>
        <Flex gap="4">
          <span>Model:</span>
          <code>{model}</code>
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

  renderResultTrace(result: SwEffectResult<typeof AIJsonNEffect>) {
    return renderJsonWell("AI JSON Response", result);
  },
};
