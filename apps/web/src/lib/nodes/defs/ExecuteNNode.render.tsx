import { ResolveSwNodeRefs, SwNodeResult, SwNodeValue } from "streamweave-core";

import { renderJsonWell, Well } from "../../../components/base/Well";
import { ExecuteNNode } from "./ExecuteNNode";

export const ExecuteNNodeRender = {
  renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<typeof ExecuteNNode>>) => (
    <>
      <Well title="Instructions" markdownPreferred>
        {value.instructions}
      </Well>
      <Well title="Relevant Files">{value.relevantFiles.map((file) => file).join("\n") || ""}</Well>
    </>
  ),
  renderResult: (result: SwNodeResult<typeof ExecuteNNode>) => (
    <>
      <Well title="Raw Result" markdownPreferred>
        {result.result.rawChangeSet}
      </Well>
      {renderJsonWell("Result", {
        generalNoteList: result.result.generalNoteList,
        filesToChange: result.result.filesToChange,
      })}
    </>
  ),
};
