import { useState } from "react";
import { Button, CheckboxCards, Dialog } from "@radix-ui/themes";
import { Flex } from "styled-system/jsx";

import { createDialog } from "./base/PromiseDialog";

export const RevertFilesDialog = createDialog<
  { paths: string[] },
  string[] // paths to change
>(({ paths, resolve }) => {
  const [selectedPaths, setSelectedPaths] = useState<string[]>(paths);

  return (
    <Dialog.Root open>
      <Dialog.Content width="600px">
        <Dialog.Title>
          Would you like to revert {selectedPaths.length} file write{selectedPaths.length !== 1 ? "s" : ""}?
        </Dialog.Title>
        <CheckboxCards.Root columns="1" value={selectedPaths} onValueChange={setSelectedPaths}>
          {paths.map((path) => (
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
