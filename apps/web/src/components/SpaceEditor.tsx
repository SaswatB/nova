import { useEffect, useMemo, useState } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { toast } from "react-toastify";
import { Button, Dialog } from "@radix-ui/themes";
import * as idb from "idb-keyval";
import { produce } from "immer";
import { reverse, sortBy } from "lodash";
import { Pane } from "split-pane-react";
import SplitPane from "split-pane-react/esm/SplitPane";
import { Stack, styled } from "styled-system/jsx";
import { stack } from "styled-system/patterns";
import { VList } from "virtua";
import { z } from "zod";

import { useLocalStorage } from "../lib/hooks/useLocalStorage";
import { useUpdatingRef } from "../lib/hooks/useUpdatingRef";
import { ProjectContext } from "../lib/prototype/nodes/node-types";
import { GraphRunner, GraphRunnerData } from "../lib/prototype/nodes/run-graph";
import { newId } from "../lib/uid";
import { Loader } from "./base/Loader";
import { GraphCanvas } from "./GraphCanvas";
import { NodeViewer } from "./NodeViewer";
import { TraceElement, traceElementSourceSymbol, TraceElementView } from "./TraceElementView";
import { textAreaField, ZodForm } from "./ZodForm";

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

function NewPlan({ onNewGoal }: { onNewGoal: (goal: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button>New Plan</Button>
      </Dialog.Trigger>
      <Dialog.Content width="400px">
        <Dialog.Title>New Plan</Dialog.Title>
        <ZodForm
          schema={z.object({ goal: z.string().min(1) })}
          overrideFieldMap={{ goal: textAreaField }}
          onSubmit={({ goal }) => {
            onNewGoal(goal);
            setOpen(false);
          }}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}

interface Page {
  id: string;
  name: string;
  graphData?: GraphRunnerData;
}

export function SpaceEditor({ projectId, spaceId }: { projectId: string; spaceId: string }) {
  const [sizes, setSizes] = useLocalStorage<number[]>("space:sizes", [60, 40]);
  const handle = useAsync(() => idb.get<FileSystemDirectoryHandle>(`project:${projectId}:root`), [projectId]);

  const pagesAsync = useAsync((spaceId: string) => idb.get<Page[]>(`space:${spaceId}:pages`), [spaceId]);
  const pagesRef = useUpdatingRef(pagesAsync.result);
  const setPages = (pages: Page[] | ((pages: Page[]) => Page[])) => {
    const newPages = typeof pages === "function" ? pages(pagesRef.current || []) : pages;
    pagesAsync.set({ status: "success", loading: false, error: undefined, result: newPages });
    pagesRef.current = newPages;
    void idb.set(`space:${spaceId}:pages`, newPages).catch(console.error);
  };
  const [selectedPageId, setSelectedPageId] = useLocalStorage<string | null>(`space:${spaceId}:selectedPageId`, null);
  const selectedPage = pagesRef.current?.find((page) => page.id === selectedPageId);

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

    graphRunner.on("dataChanged", () => {
      if (cancelled) return;
      setPages(
        produce((draft) => {
          const page = draft.find((p) => p.id === selectedPageId);
          if (page) page.graphData = graphRunner.toData();
        }),
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

  if (!handle.result || pagesAsync.loading) return <Loader fill />;
  return (
    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
      <Pane minSize={15} className={stack({ bg: "background.primary" })}>
        {selectedPage?.graphData ? (
          <GraphCanvas
            graphData={selectedPage.graphData}
            actions={
              <Button
                loading={runGraph.loading}
                onClick={() =>
                  runGraph.execute().catch((error) => {
                    console.error(error);
                    toast.error(error.message);
                  })
                }
              >
                Run
              </Button>
            }
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
          />
        ) : (
          <Stack css={{ alignItems: "center", justifyContent: "center", height: "100%" }}>
            <NewPlan
              onNewGoal={(goal) => {
                const graphData = GraphRunner.fromGoal(getProjectContext(handle.result!), goal).toData();
                if (selectedPage) {
                  setPages(
                    produce((draft) => {
                      const page = draft.find((p) => p.id === selectedPage.id);
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
          </Stack>
        )}
      </Pane>
      <Pane minSize={15} className={stack({ bg: "background.secondary" })}>
        {selectedNode ? (
          <NodeViewer
            key={selectedNodeId}
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
        ) : !selectedPage?.graphData?.trace.length ? (
          <Stack
            css={{
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
            }}
          >
            No trace yet
          </Stack>
        ) : (
          <Stack css={{ flex: 1 }}>
            <VList>
              <styled.h2 css={{ fontSize: 16, fontWeight: "bold", mt: 8, ml: 16, py: 8 }}>Graph Trace</styled.h2>
              {reverse(
                sortBy(
                  selectedPage.graphData.trace.flatMap((t): TraceElement[] =>
                    t.type === "start-node"
                      ? [t, ...(t.node.state?.trace || []).map((tr) => ({ ...tr, [traceElementSourceSymbol]: t.node }))]
                      : [t],
                  ),
                  "timestamp",
                ),
              ).map((trace, i) => (
                <TraceElementView key={i} trace={trace} />
              ))}
            </VList>
          </Stack>
        )}
      </Pane>
    </SplitPane>
  );
}
