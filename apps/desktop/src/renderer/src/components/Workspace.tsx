import { useState } from "react";
import { useLocalStorage } from "@renderer/lib/hooks/useLocalStorage";
import { ChatNode } from "@renderer/lib/types";
import { produce } from "immer";
import { Pane } from "split-pane-react";
import SplitPane from "split-pane-react/esm/SplitPane";
import { stack } from "styled-system/patterns";

import { NodeCanvas } from "./NodeCanvas";
import { NodeViewer } from "./NodeViewer";

export function Workspace() {
  const [sizes, setSizes] = useState([50, 50]);

  const [nodes, setNodes] = useLocalStorage<ChatNode[]>("nodes", []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  return (
    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
      <Pane minSize={20} className={stack()}>
        <NodeCanvas
          nodes={nodes}
          setNodes={setNodes}
          selectedNodeId={selectedNodeId}
          setSelectedNodeId={setSelectedNodeId}
        />
      </Pane>
      <Pane minSize={20} className={stack()}>
        <NodeViewer
          node={nodes.find((n) => n.id === selectedNodeId)}
          setNode={(update) => {
            setNodes(
              produce((draft) => {
                const index = draft.findIndex((n) => n.id === selectedNodeId);
                if (index !== -1) {
                  draft[index] = typeof update === "function" ? update(draft[index]) : update;
                }
              }),
            );
          }}
        />
      </Pane>
    </SplitPane>
  );
}
