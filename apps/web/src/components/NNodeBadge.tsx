import { Button } from "@radix-ui/themes";
import { startCase } from "lodash";
import { SwNodeInstance } from "streamweave-core";

export function NNodeBadge({ node, onNodeNav }: { node: SwNodeInstance; onNodeNav: (node: SwNodeInstance) => void }) {
  return (
    <Button size="1" variant="soft" onClick={() => onNodeNav(node)}>
      {startCase(node.typeId)}
    </Button>
  );
}
