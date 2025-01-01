import { ResolveSwNodeRefs, SwNodeValue } from "streamweave-core";

import { Well } from "../../../components/base/Well";
import { ContextId, contextIdMap, ContextNNode } from "./ContextNNode";

export const ContextNNodeRender = {
  renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<typeof ContextNNode>>) => (
    <Well title={contextIdMap[value.contextId as ContextId]?.description || value.contextId} markdownPreferred>
      {value.context || ""}
    </Well>
  ),
  renderResult: () => null,
};
