import { orRef } from "streamweave-core";
import { z } from "zod";

import { swNode } from "../swNode";

const ContextId = z.string().brand<"ContextId">();
export type ContextId = z.infer<typeof ContextId>;

export const ContextNNode = swNode
  .input(z.object({ contextId: ContextId, context: orRef(z.string()) }))
  .output(z.object({ context: z.string() }))
  .runnable(async (value) => ({ context: value.context }));

export const contextIdMap: Record<ContextId, { description: string }> = {};
export function registerContextId(id: string, description: string) {
  if (contextIdMap[id as ContextId]) throw new Error(`Context id ${id} already registered`);
  contextIdMap[id as ContextId] = { description };
  return id as ContextId;
}
