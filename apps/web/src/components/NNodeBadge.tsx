import { Button } from "@radix-ui/themes";
import { startCase } from "lodash";

import { NNode } from "../lib/nodes/run-graph";

export function NNodeBadge({ node, onNodeNav }: { node: NNode; onNodeNav: (node: NNode) => void }) {
  return (
    <Button size="1" variant="soft" onClick={() => onNodeNav(node)}>
      {startCase(node.typeId)}
    </Button>
  );
}
