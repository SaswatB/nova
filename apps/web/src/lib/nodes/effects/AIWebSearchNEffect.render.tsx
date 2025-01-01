import { SwEffectParam, SwEffectResult } from "streamweave-core";

import { renderJsonWell, Well } from "../../../components/base/Well";
import { AIWebSearchNEffect } from "./AIWebSearchNEffect";

export const AIWebSearchNEffectRender = {
  renderRequestTrace(query: SwEffectParam<typeof AIWebSearchNEffect>) {
    return <Well title="AI Web Search Request">{query}</Well>;
  },

  renderResultTrace(result: SwEffectResult<typeof AIWebSearchNEffect>) {
    return renderJsonWell("AI Web Search Result", result);
  },
};
