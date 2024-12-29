import { GetEffectContext, GetNodeContext, SwNodeMap } from "./nodes";
import { GraphRunner, GraphRunnerData } from "./GraphRunner";

export type {
  GraphRunnerData,
  GraphTraceEvent,
  SwNodeInstance,
  SwNodeTraceEvent,
} from "./GraphRunner";
export { resolveNodeRef, resolveNodeValueRefs } from "./GraphRunner";

// #region builder

interface SwRunnerBuilder<NodeMap extends SwNodeMap> {
  nodes<NewNodeMap extends SwNodeMap>(
    nodes: NewNodeMap
  ): Pick<SwRunnerBuilder<NewNodeMap>, "effectContext">;

  effectContext(
    effectContext: GetEffectContext<NodeMap>
  ): Pick<SwRunnerBuilder<NodeMap>, "nodeContext">;
  nodeContext(
    nodeContext: GetNodeContext<NodeMap>
  ): Pick<SwRunnerBuilder<NodeMap>, "create" | "createFromData">;

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
  T extends Partial<SwRunnerBuilder<infer NodeMap>>
    ? GraphRunner<NodeMap>
    : never;

function createSwRunnerBuilder<NodeMap extends SwNodeMap>(
  nodeMap: NodeMap,
  effectContext: GetEffectContext<NodeMap>,
  nodeContext: GetNodeContext<NodeMap>
): SwRunnerBuilder<NodeMap> {
  return {
    nodes: (nodes) =>
      createSwRunnerBuilder(nodes, effectContext as any, nodeContext as any),
    effectContext: (effectContext) =>
      createSwRunnerBuilder(nodeMap, effectContext, nodeContext),
    nodeContext: (nodeContext) =>
      createSwRunnerBuilder(nodeMap, effectContext, nodeContext),
    create: () => new GraphRunner(nodeMap, effectContext, nodeContext),
    createFromData: (data) =>
      GraphRunner.fromData(nodeMap, effectContext, nodeContext, data),
  };
}

export const swRunnerInit: Pick<
  SwRunnerBuilder<{}>,
  "nodes" | "effectContext"
> = createSwRunnerBuilder({}, {}, {});

// #endregion
