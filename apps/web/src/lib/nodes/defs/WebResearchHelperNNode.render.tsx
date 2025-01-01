import { ResolveSwNodeRefs, SwNodeResult, SwNodeValue } from "streamweave-core";

import { Well } from "../../../components/base/Well";
import { WebResearchHelperNNode } from "./WebResearchHelperNNode";

export const WebResearchHelperNNodeRender = {
  renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<typeof WebResearchHelperNNode>>) => (
    <Well title="Query" markdownPreferred>
      {value.query}
    </Well>
  ),
  renderResult: (result: SwNodeResult<typeof WebResearchHelperNNode>) => (
    <>
      <Well title="Result" markdownPreferred>
        {result.result}
      </Well>
      <Well title="Sources" markdownPreferred>
        {result.sources
          .map((source) => "* " + [source.title?.trim(), source.url.trim()].filter((s) => !!s).join(" - "))
          .join("\n")}
      </Well>
    </>
  ),
};
