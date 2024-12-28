export enum SwScopeType {
  Space, // top level, only one in a graph
  Task,
}

export type SwScope =
  | { type: SwScopeType.Space }
  | { type: SwScopeType.Task; namespace: string };

export const SwSpaceScope: SwScope = { type: SwScopeType.Space };

export function createSwTaskScope(namespace: string): SwScope {
  return { type: SwScopeType.Task, namespace };
}
