import ReactDiffViewer from "react-diff-viewer";
import { ResolveSwNodeRefs, SwNodeResult, SwNodeValue } from "streamweave-core";

import { Well } from "../../../components/base/Well";
import { ApplyFileChangesNNode } from "./ApplyFileChangesNNode";

export const ApplyFileChangesNNodeRender = {
  renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<typeof ApplyFileChangesNNode>>) => (
    <Well title={`Changes ${value.path}`} markdownPreferred>
      {value.changes || ""}
    </Well>
  ),
  renderResult: (result: SwNodeResult<typeof ApplyFileChangesNNode>) => (
    <ReactDiffViewer oldValue={result.original} newValue={result.result} splitView={false} useDarkTheme />
  ),
};
