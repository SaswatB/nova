import { useState } from "react";
import { Button, CheckboxCards, Dialog } from "@radix-ui/themes";
import { SwEffectResult } from "streamweave-core";
import { SwEffectParam } from "streamweave-core";
import { css } from "styled-system/css";
import { Flex, Stack } from "styled-system/jsx";

import { SwEffectTraceRevertEntry } from "../../../../packages/streamweave-core/src/GraphRunner";
import { WriteFileNEffectRender } from "../lib/nodes/effects/WriteFileNEffect.render";
import { ProjectContext } from "../lib/nodes/project-ctx";
import { swNode } from "../lib/nodes/swNode";
import { GraphRunner } from "../lib/nodes/swRunner";
import { createDialog } from "./base/PromiseDialog";

const effectRevertRenderMap: Partial<{
  [EffectTypeId in keyof GraphRunner["effectMap"]]: {
    renderRevertPreview: (
      request: SwEffectParam<GraphRunner["effectMap"][EffectTypeId]>,
      result: SwEffectResult<GraphRunner["effectMap"][EffectTypeId]>,
      { projectContext }: { projectContext: ProjectContext },
    ) => {
      title: React.ReactNode;
      body: React.ReactNode;
    };
  };
}> = {
  writeFile: WriteFileNEffectRender,
};
// run time check ;_;
Object.entries(swNode.effectMap).forEach(([key, effect]) => {
  if (effect.revertable && !(key in effectRevertRenderMap)) {
    throw new Error(`No revert render for effect ${key}`);
  }
});

export const RevertChangesDialog = createDialog<
  { entries: SwEffectTraceRevertEntry[]; projectContext: ProjectContext },
  string[] // ids to change
>(({ entries, projectContext, resolve }) => {
  const [selectedEntries, setSelectedEntries] = useState(() => entries.map((e) => e.id));
  const [expandedEntries, setExpandedEntries] = useState<Record<string, boolean>>({});

  const toggleDiff = async (path: string) => {
    setExpandedEntries((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <Dialog.Root open>
      <Dialog.Content width="800px">
        <Dialog.Title>
          Would you like to revert {selectedEntries.length} change{selectedEntries.length !== 1 ? "s" : ""}?
        </Dialog.Title>

        <CheckboxCards.Root columns="1" value={selectedEntries} onValueChange={setSelectedEntries}>
          {entries.map((entry) => {
            const id = entry.id;
            const { title, body } = effectRevertRenderMap[
              entry.effectId as keyof GraphRunner["effectMap"]
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ]!.renderRevertPreview(entry.request as any, entry.result as any, { projectContext });
            return (
              <Stack key={entry.id}>
                <Flex css={{ alignItems: "center", gap: 8 }}>
                  <CheckboxCards.Item value={id} className={css({ flex: 1 })}>
                    {title}
                  </CheckboxCards.Item>
                  {body ? (
                    <Button variant="soft" onClick={() => toggleDiff(id)}>
                      {expandedEntries[id] ? "Hide" : "View"}
                    </Button>
                  ) : null}
                </Flex>
                {expandedEntries[id] && body}
              </Stack>
            );
          })}
        </CheckboxCards.Root>

        <Flex css={{ justifyContent: "space-between", mt: 16 }}>
          <Button color="red" onClick={() => resolve([])}>
            No
          </Button>
          <Button onClick={() => resolve(selectedEntries)}>
            Revert {selectedEntries.length} change{selectedEntries.length !== 1 ? "s" : ""}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
});
