import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { createNodeDef, NNodeDef } from "../node-types";
import { orRef } from "../ref-types";

const ContextId = z.string().brand<"ContextId">();
export type ContextId = z.infer<typeof ContextId>;

const typeId = "context" as const;
const inputsSchema = z.object({ contextId: ContextId, context: orRef(z.string()) });
const outputsSchema = z.object({ context: z.string() });

export const ContextNNode = createNodeDef<typeof typeId, z.infer<typeof inputsSchema>, z.infer<typeof outputsSchema>>(
  typeId,
  inputsSchema as any, // todo fix broken types due to branding
  outputsSchema,
  {
    run: async (value) => {
      return { context: value.context };
    },
    renderInputs: (v) => (
      <Well title={contextIdMap[v.contextId]?.description || v.contextId} markdownPreferred>
        {v.context}
      </Well>
    ),
    renderResult: () => null,
  },
);

const contextIdMap: Record<ContextId, { description: string; nodeDefTypeId: string }> = {};
export function registerContextId(nodeDef: NNodeDef, id: string, description: string) {
  contextIdMap[id as ContextId] = { description, nodeDefTypeId: nodeDef.typeId };
  return id as ContextId;
}
