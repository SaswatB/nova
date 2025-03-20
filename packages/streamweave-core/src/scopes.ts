export enum SwScopeType {
  Space, // top level, only one in a graph
  NodeRun, // created when a run is started for a single node
  Task,
}

export type SwScope =
  | { type: SwScopeType.Space }
  | { type: SwScopeType.NodeRun }
  | { type: SwScopeType.Task; namespace: string };

export const SwSpaceScope: SwScope = { type: SwScopeType.Space };

export function createSwTaskScope(namespace: string): SwScope {
  return { type: SwScopeType.Task, namespace };
}
