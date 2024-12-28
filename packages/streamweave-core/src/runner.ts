import { SwNodeMap } from "./nodes";
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
  ): Pick<SwRunnerBuilder<NewNodeMap>, "create" | "createFromData">;
  create(): GraphRunner<NodeMap>;
  createFromData(data: GraphRunnerData): GraphRunner<NodeMap>;
}

export type ExtractGraphRunner<T extends Pick<SwRunnerBuilder<any>, "create">> =
  T extends Pick<SwRunnerBuilder<infer NodeMap>, "create">
    ? GraphRunner<NodeMap>
    : never;

function createSwRunnerBuilder<NodeMap extends SwNodeMap>(
  nodeMap: NodeMap
): SwRunnerBuilder<NodeMap> {
  return {
    nodes: (nodes) => createSwRunnerBuilder(nodes),
    create: () => new GraphRunner(nodeMap),
    createFromData: (data) => GraphRunner.fromData(nodeMap, data),
  };
}

export const swRunnerInit = createSwRunnerBuilder({});

// #endregion
