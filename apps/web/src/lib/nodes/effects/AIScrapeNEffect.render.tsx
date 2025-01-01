import { SwEffectParam, SwEffectResult } from "streamweave-core";

import { renderJsonWell, Well } from "../../../components/base/Well";
import { AIScrapeNEffect } from "./AIScrapeNEffect";

export const AIScrapeNEffectRender = {
  renderRequestTrace({ jsonSchema, url, prompt }: SwEffectParam<typeof AIScrapeNEffect>) {
    return (
      <>
        <Well title="URL" code="url">
          {url}
        </Well>
        <Well title="Prompt" markdownPreferred>
          {prompt}
        </Well>
        {renderJsonWell("Schema", jsonSchema)}
      </>
    );
  },

  renderResultTrace(result: SwEffectResult<typeof AIScrapeNEffect>) {
    return renderJsonWell("AI Scrape Result", result);
  },
};
