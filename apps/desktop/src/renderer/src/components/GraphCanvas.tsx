import { Dispatch, memo, ReactNode, SetStateAction, useMemo } from "react";
import Dagre from "@dagrejs/dagre";
import { GraphRunnerData } from "@renderer/lib/prototype/nodes/run-graph";
import { Background, Controls, Edge, Handle, Node, NodeProps, Panel, Position, ReactFlow } from "@xyflow/react";
import { startCase } from "lodash";
import { Flex } from "styled-system/jsx";

const convertChatNodesToFlowElements = (graphNodes: GraphRunnerData["nodes"]): { nodes: Node[]; edges: Edge[] } => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR" });

  const nodes = Object.values(graphNodes).map(
    (node): Node => ({
      id: node.id,
      type: "default",
      data: { label: startCase(node.value.type) },
      position: { x: 0, y: 0 },
      selectable: true,
    }),
  );
  nodes.forEach((node) => g.setNode(node.id, { width: 100, height: 100 }));

  const edges = Object.values(graphNodes).flatMap((node) =>
    (node.dependencies || []).map(
      (depId): Edge => ({
        id: `e${node.id}-${depId}`,
        source: node.id,
        target: depId,
        animated: true,
        selectable: false,
      }),
    ),
  );
  edges.forEach((edge) => g.setEdge(edge.source, edge.target));

  Dagre.layout(g);
  return { nodes: nodes.map((node) => ({ ...node, position: { x: g.node(node.id).x, y: g.node(node.id).y } })), edges };
};

const CustomNodeView = memo(({ data }: NodeProps<Node<{ label: string }>>) => {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <div>{data.label}</div>
      <Handle type="source" position={Position.Right} />
    </>
  );
});
CustomNodeView.displayName = "CustomNodeView";

export function GraphCanvas({
  graphData,
  actions,
  selectedNodeId,
  setSelectedNodeId,
}: {
  graphData: GraphRunnerData;
  actions: ReactNode;
  selectedNodeId: string | null;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
}) {
  const graphView = useMemo(() => convertChatNodesToFlowElements(graphData.nodes), [graphData.nodes]);
  const nodes = useMemo(() => {
    return graphView.nodes.map((node) => ({ ...node, selected: node.id === selectedNodeId }));
  }, [graphView.nodes, selectedNodeId]);

  return (
    <Flex css={{ flex: "1" }}>
      <ReactFlow
        nodes={nodes}
        edges={graphView.edges}
        nodesDraggable={false}
        nodesConnectable={false}
        colorMode="dark"
        nodeTypes={{ default: CustomNodeView }}
        fitView
        onNodesChange={(changes) => {
          const selected = changes.find(
            (change): change is typeof change & { type: "select" } => change.type === "select",
          );
          if (selected) setSelectedNodeId(selected.selected ? selected.id : null);
        }}
      >
        <Panel position="top-right">{actions}</Panel>
        <Controls />
        <Background />
      </ReactFlow>
    </Flex>
  );
}
