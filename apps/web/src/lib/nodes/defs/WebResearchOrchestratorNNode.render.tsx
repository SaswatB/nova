import { ResolveSwNodeRefs, SwNodeResult, SwNodeValue } from "streamweave-core";

import { Well } from "../../../components/base/Well";
import { WebResearchOrchestratorNNode } from "./WebResearchOrchestratorNNode";

export const WebResearchOrchestratorNNodeRender = {
  renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<typeof WebResearchOrchestratorNNode>>) => (
    <Well title="Research Goal" markdownPreferred>
      {value.goal}
    </Well>
  ),
  renderResult: (result: SwNodeResult<typeof WebResearchOrchestratorNNode>) =>
    result.results.map((r, i) => (
      <Well key={i} title={r.query} markdownPreferred>
        {r.result + "\n\nSources:\n" + r.sources?.map((u) => `- [${u.title || u.url}](${u.url})`).join("\n")}
      </Well>
    )),
};
