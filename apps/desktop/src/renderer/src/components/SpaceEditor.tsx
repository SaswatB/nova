import { useEffect, useMemo, useState } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { Button, Dialog, TextField } from "@radix-ui/themes";
import { useLocalStorage } from "@renderer/lib/hooks/useLocalStorage";
import { useZodForm } from "@renderer/lib/hooks/useZodForm";
import { ProjectContext } from "@renderer/lib/prototype/nodes/node-types";
import { GraphRunner, GraphRunnerData } from "@renderer/lib/prototype/nodes/run-graph";
import { newId } from "@renderer/lib/uid";
import * as idb from "idb-keyval";
import { produce } from "immer";
import { Pane } from "split-pane-react";
import SplitPane from "split-pane-react/esm/SplitPane";
import { Flex, Stack } from "styled-system/jsx";
import { stack } from "styled-system/patterns";
import { z } from "zod";

import { FormHelper } from "./base/FormHelper";
import { GraphCanvas } from "./GraphCanvas";
import { NodeViewer } from "./NodeViewer";

const getProjectContext = (folderHandle: FileSystemDirectoryHandle): ProjectContext => ({
  systemPrompt: `
You are an expert staff level software engineer.
Working with other staff level engineers on a project.
Do not bikeshed unless asked.
Provide useful responses, make sure to consider when to stay high level and when to dive deep.
  `.trim(),
  rules: [
    "Strict TypeScript is used throughout the codebase.",
    "Type inference is preferred over explicit types when possible.",
    "Prefer concise and expressive code over verbose code, but keep things readable and use comments if necessary.",
    "Never use require, always use import. Any exceptions must be justified with a comment.",
    "Do not refactor the codebase unless required for the task.",
    "Do not delete dead code or comments unless it is directly related to the task.",
    "Keep error handling to a minimum.",
    "Don't worry about unit tests unless they are explicitly asked for.",
    "It's fine to have large complex functions during the initial implementation as this is a proof of concept.",
  ],
  folderHandle,
  extensions: [".ts", ".tsx", ".js", ".jsx", ".json", ".xml", ".html", ".css", ".scss"],
});

function NewGoal({ onNewGoal }: { onNewGoal: (goal: string) => void }) {
  const [open, setOpen] = useState(false);

  const form = useZodForm({ schema: z.object({ goal: z.string().min(1) }) });
  const onSubmit = form.handleSubmit((data) => {
    onNewGoal(data.goal);
    setOpen(false);
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button>New Goal</Button>
      </Dialog.Trigger>
      <Dialog.Content width="400px">
        <Dialog.Title>New Goal</Dialog.Title>
        <Stack css={{ gap: 16 }}>
          <FormHelper error={form.formState.errors.root?.message} variant="callout" />

          <Stack css={{ gap: 1 }}>
            <TextField.Root placeholder="New Goal" {...form.register("goal")} />
            <FormHelper error={form.formState.errors.goal?.message} />
          </Stack>

          <Flex css={{ justifyContent: "flex-end" }}>
            <Button onClick={onSubmit}>Save</Button>
          </Flex>
        </Stack>
      </Dialog.Content>
    </Dialog.Root>
  );
}

export function SpaceEditor({ projectId, spaceId }: { projectId: string; spaceId: string }) {
  const [sizes, setSizes] = useLocalStorage<number[]>("space:sizes", [60, 40]);
  const handle = useAsync(() => idb.get<FileSystemDirectoryHandle>(`project:${projectId}:root`), [projectId]);
  const [pages, setPages] = useLocalStorage<{ id: string; name: string; graphData?: GraphRunnerData }[]>(
    `space:${spaceId}:pages`,
    [],
  );
  const [selectedPageId, setSelectedPageId] = useLocalStorage<string | null>(`space:${spaceId}:selectedPageId`, null);
  const selectedPage = pages.find((page) => page.id === selectedPageId);

  const [refreshIndex, setRefreshIndex] = useState(0); // refreshes the graph runner
  const graphRunner = useMemo(
    () =>
      !!selectedPage?.graphData &&
      handle.result &&
      GraphRunner.fromData(getProjectContext(handle.result), selectedPage.graphData),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!selectedPage?.graphData, selectedPageId, handle.result, refreshIndex],
  );
  useEffect(() => {
    if (!graphRunner) return;
    let cancelled = false;

    handle.result?.requestPermission({ mode: "readwrite" });

    graphRunner.on("dataChanged", () => {
      if (cancelled) return;
      setPages((pages) =>
        pages.map((page) => (page.id === selectedPageId ? { ...page, graphData: graphRunner.toData() } : page)),
      );
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphRunner]);
  const runGraph = useAsyncCallback(async () => (graphRunner || undefined)?.run());

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(
    () => selectedNodeId && selectedPage?.graphData?.nodes[selectedNodeId],
    [selectedPage?.graphData?.nodes, selectedNodeId],
  );

  return (
    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
      <Pane minSize={15} className={stack({ bg: "background.primary" })}>
        {selectedPage?.graphData ? (
          <GraphCanvas
            graphData={selectedPage.graphData}
            actions={
              <Button loading={runGraph.loading} onClick={() => runGraph.execute().catch(console.error)}>
                Run
              </Button>
            }
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
          />
        ) : (
          <NewGoal
            onNewGoal={(goal) => {
              const graphData = GraphRunner.fromGoal(getProjectContext(handle.result!), goal).toData();
              if (selectedPageId) {
                setPages(
                  produce((draft) => {
                    const page = draft.find((p) => p.id === selectedPageId);
                    if (page) page.graphData = graphData;
                  }),
                );
              } else {
                const id = newId.spacePage();
                setPages((p) => [...p, { id, name: `Page ${p.length + 1}`, graphData }]);
                setSelectedPageId(id);
              }
            }}
          />
        )}
      </Pane>
      <Pane minSize={15} className={stack({ p: 24, bg: "background.secondary" })}>
        {selectedNode ? (
          <NodeViewer
            node={selectedNode}
            onChangeNode={(apply) => {
              setPages(
                produce((draft) => {
                  const page = draft.find((p) => p.id === selectedPageId);
                  const node = selectedNodeId && page?.graphData?.nodes[selectedNodeId];
                  if (!node) return;
                  apply(node);
                }),
              );
              setRefreshIndex(refreshIndex + 1);
            }}
          />
        ) : (
          <Stack
            css={{
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
            }}
          >
            Select a node
          </Stack>
        )}
      </Pane>
    </SplitPane>
  );
}
