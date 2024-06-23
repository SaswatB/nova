import { useState } from "react";
import { useAsync } from "react-async-hook";
import ReactDiffViewer from "react-diff-viewer";
import { Button, CheckboxCards, Dialog } from "@radix-ui/themes";
import { css } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";

import { createDialog } from "./base/PromiseDialog";

export const RevertFilesDialog = createDialog<
  { files: { path: string; original: string }[]; getFileContent: (path: string) => Promise<string> },
  string[] // paths to change
>(({ files, getFileContent, resolve }) => {
  const [selectedPaths, setSelectedPaths] = useState(() => files.map((f) => f.path));
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});

  const toggleDiff = async (path: string) => {
    setExpandedDiffs((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  return (
    <Dialog.Root open>
      <Dialog.Content width="800px">
        <Dialog.Title>
          Would you like to revert {selectedPaths.length} file{selectedPaths.length !== 1 ? "s" : ""}?
        </Dialog.Title>

        <CheckboxCards.Root columns="1" value={selectedPaths} onValueChange={setSelectedPaths}>
          {files.map(({ path, original }) => (
            <Stack key={path}>
              <Flex css={{ alignItems: "center", gap: 8 }}>
                <CheckboxCards.Item value={path} className={css({ flex: 1 })}>
                  <code>{path}</code>
                </CheckboxCards.Item>
                <Button variant="soft" onClick={() => toggleDiff(path)}>
                  {expandedDiffs[path] ? "Hide" : "View"}
                </Button>
              </Flex>
              {expandedDiffs[path] && (
                <FileDiffViewer path={path} original={original} getFileContent={getFileContent} />
              )}
            </Stack>
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

function FileDiffViewer({
  path,
  original,
  getFileContent,
}: {
  path: string;
  original: string;
  getFileContent: (path: string) => Promise<string>;
}) {
  const fileAsync = useAsync(getFileContent, [path]);

  if (fileAsync.loading) return <div>Loading diff...</div>;
  return (
    <styled.div css={{ maxHeight: "300px", overflow: "auto" }}>
      <ReactDiffViewer oldValue={fileAsync.result} newValue={original} splitView={false} useDarkTheme />
    </styled.div>
  );
}
