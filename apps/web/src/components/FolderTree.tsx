import { useMemo, useState } from "react";
import { useAsync } from "react-async-hook";
import { Button, Checkbox, Spinner } from "@radix-ui/themes";
import { css } from "styled-system/css";
import { Flex, Stack } from "styled-system/jsx";

import { readFileHandle } from "../lib/browser-fs";
import { readFilesRecursively } from "../lib/files";

interface NestedFolder {
  name: string;
  path: string;
  children: NestedFolder[];
}

const createNestedFolders = (paths: string[]) => {
  const root: NestedFolder = { name: "/", path: "/", children: [] };

  paths.forEach((path) => {
    const parts = path.split("/").filter(Boolean);
    let currentNode = root;

    parts.forEach((part, index) => {
      let child = currentNode.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, path: "/" + parts.slice(0, index + 1).join("/"), children: [] };
        currentNode.children.push(child);
      }
      currentNode = child;
    });
  });

  return root;
};

function FolderTreeItem({
  folder,
  selectedPaths,
  handleToggle,
}: {
  folder: NestedFolder;
  selectedPaths: string[];
  handleToggle: (path: string) => void;
}) {
  const expandable = folder.children.length > 0 && folder.path !== "/";
  const [isExpanded, setIsExpanded] = useState(folder.path === "/");

  return (
    <Stack>
      <label>
        <Flex css={{ alignItems: "center", gap: 8 }}>
          <Button
            variant="ghost"
            className={css({ fontFamily: "monospace", opacity: expandable ? 1 : 0 })}
            onClick={() => expandable && setIsExpanded((e) => !e)}
          >
            {isExpanded ? "-" : "+"}
          </Button>
          <Checkbox
            checked={
              selectedPaths.includes(folder.path) ||
              (selectedPaths.some((p) => p.startsWith(folder.path)) ? "indeterminate" : false)
            }
            onCheckedChange={() => handleToggle(folder.path)}
          />
          {folder.name}
        </Flex>
      </label>
      {isExpanded && (
        <Stack ml="12">
          {folder.children.map((child) => (
            <FolderTreeItem key={child.path} folder={child} selectedPaths={selectedPaths} handleToggle={handleToggle} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

export function FolderTree({
  folderHandle,
  selectedPaths,
  onSelectedPathsChange,
}: {
  folderHandle: FileSystemDirectoryHandle;
  selectedPaths: string[];
  onSelectedPathsChange: (paths: string[]) => void;
}) {
  const allDirs = useAsync(async () => {
    const files = await readFilesRecursively((p) => readFileHandle(p, folderHandle), "/", []);
    return files.filter((f) => f.type === "directory");
  }, [folderHandle]);
  const rootFolder = useMemo(
    () => (allDirs.result ? createNestedFolders(allDirs.result.map((dir) => dir.path)) : null),
    [allDirs.result],
  );

  const handleToggle = (path: string) => {
    const newSelectedPaths = [...selectedPaths];
    if (newSelectedPaths.includes(path)) {
      newSelectedPaths.splice(newSelectedPaths.indexOf(path), 1);
    } else {
      newSelectedPaths.push(path);
    }
    onSelectedPathsChange(newSelectedPaths);
  };

  return (
    <Stack
      css={{
        p: 12,
        bg: "background.primary",
        rounded: 8,
      }}
    >
      {rootFolder ? (
        <FolderTreeItem folder={rootFolder} selectedPaths={selectedPaths} handleToggle={handleToggle} />
      ) : allDirs.loading ? (
        <Spinner />
      ) : (
        <div>Error loading files</div>
      )}
    </Stack>
  );
}
