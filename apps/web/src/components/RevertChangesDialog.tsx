import { useState } from "react";
import { Button, CheckboxCards, Dialog } from "@radix-ui/themes";
import { css } from "styled-system/css";
import { Flex, Stack } from "styled-system/jsx";

import { createDialog } from "./base/PromiseDialog";

export const RevertChangesDialog = createDialog<
  { entries: { id: string; render: () => { title: React.ReactNode; body?: React.ReactNode } }[] },
  string[] // ids to change
>(({ entries, resolve }) => {
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
          {entries.map(({ id, render }) => {
            const { title, body } = render();
            return (
              <Stack key={id}>
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
