import { ResolveSwNodeRefs, SwNodeResult, SwNodeValue } from "streamweave-core";

import { Well } from "../../../components/base/Well";
import { RelevantFileAnalysisNNode } from "./RelevantFileAnalysisNNode";

export const RelevantFileAnalysisNNodeRender = {
  renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<typeof RelevantFileAnalysisNNode>>) => (
    <Well title="Goal" markdownPreferred>
      {value.goal}
    </Well>
  ),
  renderResult: (result: SwNodeResult<typeof RelevantFileAnalysisNNode>) => (
    <>
      <Well title="Result" markdownPreferred>
        {result.result}
      </Well>
      <Well title="Files">
        {result.files.length === 0 ? "No relevant files (empty project)" : result.files.join("\n")}
      </Well>
    </>
  ),
};
