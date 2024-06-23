import { useState } from "react";
import { useAsync } from "react-async-hook";
import { toast } from "react-toastify";
import { GearIcon } from "@radix-ui/react-icons";
import { Dialog, Flex, IconButton, Text } from "@radix-ui/themes";
import * as idb from "idb-keyval";

import { ProjectSettings } from "@repo/shared";

import { idbKey } from "../lib/keys";
import { FolderTree } from "./FolderTree";

export function ProjectSettingsEditor({
  projectId,
  allowEdit,
  settings,
  onChange,
}: {
  projectId: string;
  allowEdit: true | string;
  settings: ProjectSettings;
  onChange: (settings: ProjectSettings) => void;
}) {
  const handle = useAsync(() => idb.get<FileSystemDirectoryHandle>(idbKey.projectRoot(projectId)), [projectId]);

  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (o && allowEdit !== true) {
          toast.warn(allowEdit);
          return;
        }
        setOpen(o);
      }}
    >
      <Dialog.Trigger>
        <IconButton variant="surface" radius="full">
          <GearIcon />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 450 }}>
        <Dialog.Title>Project Settings</Dialog.Title>
        <Flex direction="column" gap="3">
          <Text as="label" size="2">
            Folder Block List:
            {handle.loading ? (
              <Text>Loading...</Text>
            ) : handle.error ? (
              <Text>Error loading folder tree</Text>
            ) : handle.result ? (
              <FolderTree
                folderHandle={handle.result}
                selectedPaths={settings.files?.blockedPaths ?? []}
                onSelectedPathsChange={(paths) =>
                  onChange({ ...settings, files: { ...settings.files, blockedPaths: paths } })
                }
              />
            ) : (
              <Text>No folder set</Text>
            )}
          </Text>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
