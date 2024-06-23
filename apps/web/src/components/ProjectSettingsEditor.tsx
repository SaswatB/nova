import { useState } from "react";
import { useAsync } from "react-async-hook";
import { toast } from "react-toastify";
import { GearIcon } from "@radix-ui/react-icons";
import { Dialog, IconButton, Tabs, Text } from "@radix-ui/themes";
import * as idb from "idb-keyval";

import { ProjectSettings } from "@repo/shared";

import { idbKey } from "../lib/keys";
import { FolderTree } from "./FolderTree";
import { RulesEditor } from "./RulesEditor";

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
      <Dialog.Content style={{ maxWidth: 800 }}>
        <Dialog.Title>Project Settings</Dialog.Title>
        <Tabs.Root defaultValue="folder-block-list">
          <Tabs.List>
            <Tabs.Trigger value="folder-block-list">File Access</Tabs.Trigger>
            <Tabs.Trigger value="rules">Rules</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="folder-block-list">
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
          </Tabs.Content>
          <Tabs.Content value="rules">
            <RulesEditor rules={settings.rules} onChange={(newRules) => onChange({ ...settings, rules: newRules })} />
          </Tabs.Content>
        </Tabs.Root>
      </Dialog.Content>
    </Dialog.Root>
  );
}
