import { useState } from "react";
import { DotsHorizontalIcon } from "@radix-ui/react-icons";
import { Button, Dialog, IconButton } from "@radix-ui/themes";
import { DropdownMenu } from "@radix-ui/themes";
import { Flex } from "styled-system/jsx";
import { z } from "zod";

import { ZodForm } from "./ZodForm";

interface SpaceActionsProps {
  space: { id: string; name: string | null };
  onRename: (id: string, newName: string) => void;
  onDelete: (id: string) => void;
}

export function SpaceActions({ space, onRename, onDelete }: SpaceActionsProps) {
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const handleRename = (values: { name: string }) => {
    onRename(space.id, values.name);
    setIsRenameOpen(false);
  };

  const handleDelete = () => {
    onDelete(space.id);
    setIsDeleteOpen(false);
  };

  return (
    <Flex css={{ gap: 2 }}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          <IconButton variant="ghost" size="1" mx="2">
            <DotsHorizontalIcon />
          </IconButton>
        </DropdownMenu.Trigger>
        <DropdownMenu.Content>
          <DropdownMenu.Item onSelect={() => setIsRenameOpen(true)}>Rename</DropdownMenu.Item>
          <DropdownMenu.Item onSelect={() => setIsDeleteOpen(true)}>Delete</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <Dialog.Root open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <Dialog.Content>
          <Dialog.Title>Rename Space</Dialog.Title>
          <ZodForm
            schema={z.object({ name: z.string() })}
            defaultValues={{ name: space.name || "" }}
            onSubmit={handleRename}
          />
        </Dialog.Content>
      </Dialog.Root>

      <Dialog.Root open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <Dialog.Content>
          <Dialog.Title>Delete Space</Dialog.Title>
          <p>Are you sure you want to delete this space? This action cannot be undone.</p>
          <Flex css={{ justifyContent: "flex-end", gap: 8, mt: 12 }}>
            <Button variant="soft" onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="solid" color="red" onClick={handleDelete}>
              Delete
            </Button>
          </Flex>
        </Dialog.Content>
      </Dialog.Root>
    </Flex>
  );
}
