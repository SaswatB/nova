import { useState } from "react";
import { Button, CheckboxCards, Dialog } from "@radix-ui/themes";
import { Flex } from "styled-system/jsx";

import { createDialog } from "./base/PromiseDialog";

export const RevertFilesDialog = createDialog<
  { files: { path: string; original: string }[] },
  string[] // paths to change
>(({ files, resolve }) => {
  const [selectedPaths, setSelectedPaths] = useState(() => files.map((f) => f.path));

  return (
    <Dialog.Root open>
      <Dialog.Content width="600px">
        <Dialog.Title>
          Would you like to revert {selectedPaths.length} file write{selectedPaths.length !== 1 ? "s" : ""}?
        </Dialog.Title>

        <CheckboxCards.Root columns="1" value={selectedPaths} onValueChange={setSelectedPaths}>
          {files.map(({ path }) => (
            <CheckboxCards.Item key={path} value={path}>
              <Flex direction="column" width="100%">
                <code>{path}</code>
              </Flex>
            </CheckboxCards.Item>
          ))}
        </CheckboxCards.Root>

        <Flex css={{ justifyContent: "space-between", mt: 16 }}>
          <Button color="red" onClick={() => resolve([])}>
            No
          </Button>
          <Button onClick={() => resolve(selectedPaths)}>
            Revert {selectedPaths.length} file{selectedPaths.length !== 1 ? "s" : ""}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
});
