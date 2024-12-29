import { GetEffectContext, GetNodeContext, SwNodeMap } from "./nodes";
import { GraphRunner, GraphRunnerData, SwCacheProvider, SwRevertProvider } from "./GraphRunner";

export type { GraphRunnerData, GraphTraceEvent, SwNodeInstance, SwNodeTraceEvent } from "./GraphRunner";
export { resolveNodeRef, resolveNodeValueRefs } from "./GraphRunner";

// #region builder

interface SwRunnerBuilder<NodeMap extends SwNodeMap> {
  nodes<NewNodeMap extends SwNodeMap>(
    nodes: NewNodeMap,
  ): Pick<SwRunnerBuilder<NewNodeMap>, "cacheProvider" | "revertProvider" | "effectContext">;

  cacheProvider(cacheProvider: SwCacheProvider): Pick<SwRunnerBuilder<NodeMap>, "revertProvider" | "effectContext">;
  revertProvider(revertProvider: SwRevertProvider): Pick<SwRunnerBuilder<NodeMap>, "effectContext">;

  effectContext(effectContext: GetEffectContext<NodeMap>): Pick<SwRunnerBuilder<NodeMap>, "nodeContext">;
  nodeContext(nodeContext: GetNodeContext<NodeMap>): Pick<SwRunnerBuilder<NodeMap>, "create" | "createFromData">;

  create(): GraphRunner<NodeMap>;
  createFromData(data: GraphRunnerData): GraphRunner<NodeMap>;
}

/**
 * Extract the GraphRunner type from a SwRunnerBuilder after nodes have been set
 *
 * @example
 * ```ts
 * const swRunner = swRunnerInit.nodes({
 *   applyFileChanges: ApplyFileChangesNNode,
 *   context: ContextNNode,
 *   // ... more nodes
 * });
 *
 * type GraphRunner = ExtractGraphRunner<typeof swRunner>;
 * ```
 */
export type ExtractGraphRunner<T extends Partial<SwRunnerBuilder<any>>> =
  T extends Partial<SwRunnerBuilder<infer NodeMap>> ? GraphRunner<NodeMap> : never;

function createSwRunnerBuilder<NodeMap extends SwNodeMap>(o: {
  nodeMap: NodeMap;
  effectContext: GetEffectContext<NodeMap>;
  nodeContext: GetNodeContext<NodeMap>;
  cacheProvider?: SwCacheProvider;
  revertProvider?: SwRevertProvider;
}): SwRunnerBuilder<NodeMap> {
  return {
    nodes: (nodes) =>
      createSwRunnerBuilder({
        ...o,
        nodeMap: nodes,
        effectContext: o.effectContext as any,
        nodeContext: o.nodeContext as any,
      }),
    cacheProvider: (cacheProvider) => createSwRunnerBuilder({ ...o, cacheProvider }),
    revertProvider: (revertProvider) => createSwRunnerBuilder({ ...o, revertProvider }),
    effectContext: (effectContext) => createSwRunnerBuilder({ ...o, effectContext }),
    nodeContext: (nodeContext) => createSwRunnerBuilder({ ...o, nodeContext }),
    create: () => new GraphRunner(o.nodeMap, o.effectContext, o.nodeContext, o.cacheProvider, o.revertProvider),
    createFromData: (data) =>
      GraphRunner.fromData(o.nodeMap, o.effectContext, o.nodeContext, o.cacheProvider, o.revertProvider, data),
  };
}

export const swRunnerInit: Pick<SwRunnerBuilder<{}>, "nodes"> = createSwRunnerBuilder({
  nodeMap: {},
  effectContext: {},
  nodeContext: {},
});

// #endregion
