import { GetEffectContext, GetNodeContext, SwNodeMap } from "./nodes";
import { GraphRunner, GraphRunnerData, SwCacheProvider, SwRevertProvider } from "./GraphRunner";

export type { GraphRunnerData, GraphTraceEvent, SwNodeInstance, SwNodeTraceEvent } from "./GraphRunner";
export { resolveNodeRef, resolveNodeValueRefs } from "./GraphRunner";

// #region builder

interface SwRunnerBuilder<NodeMap extends SwNodeMap, AllowedMethods extends keyof SwRunnerBuilder<NodeMap, any>> {
  nodes<NewNodeMap extends SwNodeMap>(
    nodes: NewNodeMap,
  ): PickedSwRunnerBuilder<
    NewNodeMap,
    Exclude<AllowedMethods, "nodes"> | "nodeMap" | "effectContext" | "nodeContext" | "create" | "createFromData"
  >;
  nodeMap: NodeMap;

  cacheProvider(
    cacheProvider: SwCacheProvider,
  ): PickedSwRunnerBuilder<NodeMap, Exclude<AllowedMethods, "cacheProvider">>;
  revertProvider(
    revertProvider: SwRevertProvider,
  ): PickedSwRunnerBuilder<NodeMap, Exclude<AllowedMethods, "revertProvider">>;

  effectContext(
    effectContext: GetEffectContext<NodeMap>,
  ): PickedSwRunnerBuilder<NodeMap, Exclude<AllowedMethods, "effectContext">>;
  nodeContext(
    nodeContext: GetNodeContext<NodeMap>,
  ): PickedSwRunnerBuilder<NodeMap, Exclude<AllowedMethods, "nodeContext">>;

  create(): GraphRunner<NodeMap>;
  createFromData(data: GraphRunnerData): GraphRunner<NodeMap>;
}

// applies AllowedMethods to the builder
type PickedSwRunnerBuilder<
  NodeMap extends SwNodeMap,
  AllowedMethods extends keyof SwRunnerBuilder<NodeMap, any>,
> = Pick<SwRunnerBuilder<NodeMap, AllowedMethods>, AllowedMethods>;

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
export type ExtractGraphRunner<T extends Pick<SwRunnerBuilder<any, any>, "nodeMap">> =
  T extends Partial<SwRunnerBuilder<infer NodeMap, any>> ? GraphRunner<NodeMap> : never;

function createSwRunnerBuilder<NodeMap extends SwNodeMap>(o: {
  nodeMap: NodeMap;
  effectContext: GetEffectContext<NodeMap>;
  nodeContext: GetNodeContext<NodeMap>;
  cacheProvider?: SwCacheProvider;
  revertProvider?: SwRevertProvider;
}): SwRunnerBuilder<NodeMap, any> {
  return {
    nodes: (nodes) =>
      createSwRunnerBuilder({
        ...o,
        nodeMap: nodes,
        effectContext: o.effectContext as any,
        nodeContext: o.nodeContext as any,
      }),
    nodeMap: o.nodeMap,
    cacheProvider: (cacheProvider) => createSwRunnerBuilder({ ...o, cacheProvider }),
    revertProvider: (revertProvider) => createSwRunnerBuilder({ ...o, revertProvider }),
    effectContext: (effectContext) => createSwRunnerBuilder({ ...o, effectContext }),
    nodeContext: (nodeContext) => createSwRunnerBuilder({ ...o, nodeContext }),
    create: () => new GraphRunner(o.nodeMap, o.effectContext, o.nodeContext, o.cacheProvider, o.revertProvider),
    createFromData: (data) =>
      GraphRunner.fromData(o.nodeMap, o.effectContext, o.nodeContext, o.cacheProvider, o.revertProvider, data),
  };
}

export const swRunnerInit: PickedSwRunnerBuilder<{}, "nodes" | "cacheProvider" | "revertProvider"> =
  createSwRunnerBuilder({
    nodeMap: {},
    effectContext: {},
    nodeContext: {},
  });

// #endregion
