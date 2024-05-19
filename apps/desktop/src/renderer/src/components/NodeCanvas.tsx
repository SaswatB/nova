import { Dispatch, SetStateAction, useMemo } from "react";
import ReactFlow, { Edge, Node } from "reactflow";
import Dagre from "@dagrejs/dagre";
import { ChatNode, ChatNodeDataType } from "@renderer/lib/types";
import { Flex } from "styled-system/jsx";
import { match, P } from "ts-pattern";

const convertChatNodesToFlowElements = (chatNodes: ChatNode[]): { nodes: Node[]; edges: Edge[] } => {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

  const nodes = chatNodes.map((node) => ({
    id: node.id,
    type: "default",
    data: { label: node.type },
    position: { x: 0, y: 0 },
  }));

  const edges = chatNodes.flatMap((node) =>
    match(node)
      .with({ type: ChatNodeDataType.CONVERSATION }, (node) => node.context || [])
      .with({ type: ChatNodeDataType.FLATTEN }, (node) => (node.context ? [node.context] : []))
      .with({ type: P.union(ChatNodeDataType.IMAGE, ChatNodeDataType.FILE) }, () => [])
      .exhaustive()
      .map(
        (contextNode): Edge => ({
          id: `e${node.id}-${contextNode.id}`,
          source: node.id,
          target: contextNode.id,
          animated: true,
        }),
      ),
  );

  Dagre.layout(g);
  return { nodes: nodes.map((node) => ({ ...node, position: { x: g.node(node.id).x, y: g.node(node.id).y } })), edges };
};

export function NodeCanvas({
  nodes,
  setNodes,
  selectedNodeId,
  setSelectedNodeId,
}: {
  nodes: ChatNode[];
  setNodes: Dispatch<SetStateAction<ChatNode[]>>;
  selectedNodeId: string | null;
  setSelectedNodeId: Dispatch<SetStateAction<string | null>>;
}) {
  const graphView = useMemo(() => convertChatNodesToFlowElements(nodes), [nodes]);

  return (
    <Flex css={{ flex: "1" }}>
      <ReactFlow nodes={graphView.nodes} edges={graphView.edges} />
    </Flex>
  );
}
