import { Dispatch, memo, ReactNode, SetStateAction, useEffect, useMemo, useRef } from "react";
import Dagre from "@dagrejs/dagre";
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
import { Flex } from "styled-system/jsx";

import { GraphRunnerData } from "../lib/prototype/nodes/run-graph";

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
  nodes.forEach((node) => g.setNode(node.id, { width: 150, height: 50 }));

  const edges = Object.values(graphNodes).flatMap((node) =>
    (node.dependencies || []).map(
      (depId): Edge => ({
        id: `e${node.id}-${depId}`,
        source: depId,
        target: node.id,
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

  const graphRef = useRef<ReactFlowInstance<any>>();
  useEffect(() => {
    setTimeout(() => {
      graphRef.current?.fitView();
    }, 100);
  }, [graphData]);

  return (
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
      >
        <Panel position="top-right">{actions}</Panel>
        <Controls />
        <Background />
      </ReactFlow>
    </Flex>
  );
}
