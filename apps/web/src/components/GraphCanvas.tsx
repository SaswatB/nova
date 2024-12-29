import {
  createContext,
  Dispatch,
  memo,
  ReactNode,
  SetStateAction,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import Dagre from "@dagrejs/dagre";
import { Badge, Button } from "@radix-ui/themes";
import {
  Background,
  Controls,
  Edge,
  Handle,
  Node,
  NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowInstance,
} from "@xyflow/react";
import { startCase } from "lodash";
import { GraphRunnerData, SwNodeInstance } from "streamweave-core";
import { css } from "styled-system/css";
import { Flex, Stack } from "styled-system/jsx";

const convertChatNodesToFlowElements = (
  graphNodes: GraphRunnerData["nodeInstances"],
): { nodes: Node[]; edges: Edge[] } => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR" });

  const nodes = Object.values(graphNodes).map(
    (node): Node => ({
      id: node.id,
      type: "default",
      data: { label: startCase(node.typeId), node },
      position: { x: 0, y: 0 },
      selectable: true,
      hidden: false,
    }),
  );
  nodes.forEach((node) => g.setNode(node.id, { width: 150, height: 90 }));

  /**
   * Checks if the target node is reachable from the current node through any of its dependencies.
   * This is used to avoid creating edges between nodes that are already connected.
   */
  function isNotRedundant(node: SwNodeInstance, targetNodeId: string) {
    let current = [...(node.dependencies || []).filter((id) => id !== targetNodeId)];
    let next = [];
    while (current.length) {
      const node = graphNodes[current.pop()!];
      if (node?.id === targetNodeId) return false;
      next.push(...(node?.dependencies || []));

      if (!current.length) {
        current = next;
        next = [];
      }
    }
    return true;
  }

  const edges = Object.values(graphNodes).flatMap((node) =>
    (node.dependencies || [])
      .filter((depId) => isNotRedundant(node, depId))
      .map(
        (depId): Edge => ({
          id: `e${node.id}-${depId}`,
          source: depId,
          target: node.id,
          animated: true,
          selectable: false,
          hidden: false,
        }),
      ),
  );
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  Dagre.layout(g);
  return { nodes: nodes.map((node) => ({ ...node, position: { x: g.node(node.id).x, y: g.node(node.id).y } })), edges };
};

const NodeContext = createContext({ isGraphRunning: false });

const CustomNodeView = memo(({ data }: NodeProps<Node<{ label: string; node: SwNodeInstance }>>) => {
  const { isGraphRunning } = useContext(NodeContext);

  const isStarted = !!data.node.state?.startedAt;
  const isCompleted = !!data.node.state?.completedAt;
  const isFailed = !!data.node.state?.error;

  return (
    <>
      <Handle type="target" position={Position.Left} />
      <Stack css={{ alignItems: "center" }}>
        {data.label}
        {isCompleted ? (
          <Badge color="green">Completed</Badge>
        ) : isStarted && isGraphRunning ? (
          <Badge>Running...</Badge>
        ) : isFailed ? (
          <Badge color="red">Failed</Badge>
        ) : null}
      </Stack>
      <Handle type="source" position={Position.Right} />
    </>
  );
});
CustomNodeView.displayName = "CustomNodeView";

export function GraphCanvas({
  graphData,
  isGraphRunning,
  topLeftActions,
  topRightActions,
  selectedNodeId,
  setSelectedNodeId,
}: {
  graphData: GraphRunnerData;
  isGraphRunning: boolean;
  topLeftActions?: ReactNode;
  topRightActions?: ReactNode;
  selectedNodeId: string | null;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
}) {
  const graphView = convertChatNodesToFlowElements(graphData.nodeInstances);
  const nodes = graphView.nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId }));

  const graphRef = useRef<ReactFlowInstance<(typeof nodes)[number]>>();
  useEffect(() => {
    setTimeout(() => {
      void graphRef.current?.fitView();
    }, 100);
  }, [graphData]);

  const nodeContext = useMemo(() => ({ isGraphRunning }), [isGraphRunning]);

  return (
    <NodeContext.Provider value={nodeContext}>
      <Flex css={{ flex: "1" }}>
        <ReactFlow
          onInit={(instance) => {
            graphRef.current = instance;
          }}
          nodes={nodes}
          edges={graphView.edges}
          nodesDraggable={false}
          nodesConnectable={false}
          colorMode="dark"
          nodeTypes={{ default: CustomNodeView }}
          fitView
          onNodesChange={(changes) => {
            const selected = changes.filter(
              (change): change is typeof change & { type: "select" } => change.type === "select",
            );
            if (selected.length) setSelectedNodeId(selected.find((s) => s.selected)?.id || null);
          }}
          onlyRenderVisibleElements={false}
        >
          <Panel position="top-left" className={css({ zIndex: 6 })}>
            {topLeftActions}
          </Panel>
          <Panel position="top-right">{topRightActions}</Panel>
          <Panel position="bottom-right">
            {selectedNodeId ? (
              <Button variant="soft" onClick={() => setSelectedNodeId(null)}>
                Clear Selection
              </Button>
            ) : null}
          </Panel>
          <Controls />
          <Background />
        </ReactFlow>
      </Flex>
    </NodeContext.Provider>
  );
}
