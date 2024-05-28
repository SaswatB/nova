import { useLocalStorage } from "@renderer/lib/hooks/useLocalStorage";
import { Pane } from "split-pane-react";
import SplitPane from "split-pane-react/esm/SplitPane";
import { stack } from "styled-system/patterns";

export function SpaceEditor({ projectId, spaceId }: { projectId: string; spaceId: string }) {
  const [sizes, setSizes] = useLocalStorage<number[]>("space:sizes", [60, 40]);

  return (
    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
      <Pane minSize={15} className={stack({ p: 24, bg: "background.primary" })}>
        <>Space Editor</>
      </Pane>
      <Pane minSize={15} className={stack({ p: 24, bg: "background.secondary" })}>
        <>Space Editor</>
      </Pane>
    </SplitPane>
  );
}
