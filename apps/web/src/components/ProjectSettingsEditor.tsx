import { useState } from "react";
import { useAsync } from "react-async-hook";
import { toast } from "react-toastify";
import { GearIcon } from "@radix-ui/react-icons";
import { Button, Checkbox, Dialog, IconButton, Tabs, Text, TextField } from "@radix-ui/themes";
import * as idb from "idb-keyval";
import { isEqual } from "lodash";
import { Flex, Stack, styled } from "styled-system/jsx";

import { ProjectSettings } from "@repo/shared";

import { idbKey } from "../lib/keys";
import { DEFAULT_EXTENSIONS, getEffectiveExtensions } from "../lib/nodes/projectctx-constants";
import { FolderTree } from "./FolderTree";
import { RulesEditor } from "./RulesEditor";

function ExtensionsManager({
  extensions,
  onExtensionsChange,
}: {
  extensions: string[];
  onExtensionsChange: (extensions: string[] | undefined) => void;
}) {
  const [newExtension, setNewExtension] = useState("");

  const handleAddExtension = () => {
    if (newExtension && !extensions.includes(newExtension)) {
      const updatedExtensions = [...extensions, newExtension];
      onExtensionsChange(isEqual(updatedExtensions.sort(), DEFAULT_EXTENSIONS.sort()) ? undefined : updatedExtensions);
      setNewExtension("");
    } else {
      toast.warn("Extension already present");
    }
  };

  const handleToggleExtension = (ext: string) => {
    const updatedExtensions = extensions.filter((e) => e !== ext);
    onExtensionsChange(isEqual(updatedExtensions.sort(), DEFAULT_EXTENSIONS.sort()) ? undefined : updatedExtensions);
  };

  return (
    <Stack>
      File Extensions:
      <Flex css={{ flexWrap: "wrap", gap: 12 }}>
        {extensions.map((ext) => (
          <Flex key={ext} align="center" css={{ gap: 4 }}>
            <Checkbox checked={true} onCheckedChange={() => handleToggleExtension(ext)} />
            <Text>{ext}</Text>
          </Flex>
        ))}
      </Flex>
      <Flex css={{ gap: 4 }}>
        <TextField.Root
          placeholder="New extension"
          value={newExtension}
          onChange={(e) => setNewExtension(e.target.value)}
        />
        <Button onClick={handleAddExtension}>Add</Button>
        <Button variant="soft" color="red" onClick={() => onExtensionsChange(undefined)}>
          Reset
        </Button>
      </Flex>
    </Stack>
  );
}

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
        <Tabs.Root defaultValue="file-access">
          <Tabs.List>
            <Tabs.Trigger value="file-access">File Access</Tabs.Trigger>
            <Tabs.Trigger value="rules">Rules</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="file-access">
            <Stack>
              <styled.div mt={12}>Folder Block List:</styled.div>
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
              <styled.hr css={{ color: "white/30" }} />
              <ExtensionsManager
                extensions={getEffectiveExtensions(settings)}
                onExtensionsChange={(newExtensions) =>
                  onChange({ ...settings, files: { ...settings.files, extensions: newExtensions } })
                }
              />
            </Stack>
          </Tabs.Content>
          <Tabs.Content value="rules">
            <RulesEditor rules={settings.rules} onChange={(newRules) => onChange({ ...settings, rules: newRules })} />
          </Tabs.Content>
        </Tabs.Root>
      </Dialog.Content>
    </Dialog.Root>
  );
}
