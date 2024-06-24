import { useState } from "react";
import { useAsync } from "react-async-hook";
import { toast } from "react-toastify";
import { Button, Checkbox, Text, TextField } from "@radix-ui/themes";
import * as idb from "idb-keyval";
import { isEqual } from "lodash";
import { Flex, Stack, styled } from "styled-system/jsx";

import { ProjectSettings } from "@repo/shared";

import { idbKey } from "../lib/keys";
import { DEFAULT_EXTENSIONS, getEffectiveExtensions } from "../lib/nodes/project-ctx";
import { FolderTree } from "./FolderTree";

interface ExtensionsManagerProps {
  extensions: string[];
  onExtensionsChange: (extensions: string[] | undefined) => void;
}

function ExtensionsManager({ extensions, onExtensionsChange }: ExtensionsManagerProps) {
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
      <Flex css={{ flexWrap: "wrap", gap: 12, ml: 12 }}>
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

interface FileAccessEditorProps {
  projectId: string;
  settings: ProjectSettings;
  onChange: (settings: ProjectSettings) => void;
}

export function FileAccessEditor({ projectId, settings, onChange }: FileAccessEditorProps) {
  const handle = useAsync(() => idb.get<FileSystemDirectoryHandle>(idbKey.projectRoot(projectId)), [projectId]);

  return (
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
  );
}
