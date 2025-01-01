import { ResolveSwNodeRefs, SwNodeValue } from "streamweave-core";

import { renderJsonWell } from "../../../components/base/Well";
import { OutputNNode } from "./OutputNNode";

export const OutputNNodeRender = {
  renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<typeof OutputNNode>>) =>
    renderJsonWell(value.description, value.value),
  renderResult: () => null,
};
