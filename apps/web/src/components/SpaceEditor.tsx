import { useEffect, useMemo, useRef, useState } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { SetValueConfig } from "react-hook-form";
import { toast } from "react-toastify";
import { Button, Checkbox, Dialog } from "@radix-ui/themes";
import { VoiceStatusPriority } from "@repo/shared";
import * as idb from "idb-keyval";
import { produce } from "immer";
import { reverse, sortBy } from "lodash";
import { Pane } from "split-pane-react";
import SplitPane from "split-pane-react/esm/SplitPane";
import { Flex, Stack, styled } from "styled-system/jsx";
import { stack } from "styled-system/patterns";
import { VList } from "virtua";
import { z } from "zod";

import { useLocalStorage } from "../lib/hooks/useLocalStorage";
import { useUpdatingRef } from "../lib/hooks/useUpdatingRef";
import { ProjectContext } from "../lib/prototype/nodes/node-types";
import { GraphRunner, GraphRunnerData } from "../lib/prototype/nodes/run-graph";
import { AppTRPCClient, trpc } from "../lib/trpc-client";
import { newId } from "../lib/uid";
import { Loader } from "./base/Loader";
import { GraphCanvas } from "./GraphCanvas";
import { NodeViewer } from "./NodeViewer";
import { TraceElement, traceElementSourceSymbol, TraceElementView } from "./TraceElementView";
import { useAddVoiceFunction, useAddVoiceStatus } from "./VoiceChat";
import { textAreaField, ZodForm } from "./ZodForm";

const getProjectContext = (
  projectId: string,
  folderHandle: FileSystemDirectoryHandle,
  trpcClient: AppTRPCClient,
  dryRun: boolean,
): ProjectContext => ({
  projectId,
  systemPrompt: `
You are an expert staff level software engineer.
Working with other staff level engineers on a project.
Do not bikeshed unless asked.
Provide useful responses, make sure to consider when to stay high level and when to dive deep.
  `.trim(),
  rules: [
    // "Strict TypeScript is used throughout the codebase.",
    // "Type inference is preferred over explicit types when possible.",
    "Prefer concise and expressive code over verbose code, but keep things readable and use comments if necessary.",
    // "Never use require, always use import. Any exceptions must be justified with a comment.",
    "Do not refactor the codebase unless required for the task.",
    "Do not delete dead code or comments unless it is directly related to the task.",
    "Keep error handling to a minimum unless otherwise explicitly asked for.",
    "Don't worry about unit tests unless they are explicitly asked for.",
    "It's fine to have large complex functions during the initial implementation.",
  ],
  extensions: [
    ".ts",
    ".mts",
    ".cts",
    ".tsx",
    ".js",
    ".mjs",
    ".cjs",
    ".jsx",
    ".json",
    ".prisma",
    ".xml",
    ".html",
    ".css",
    ".scss",
    ".md",
    ".txt",
    ".yml",
    "README",
    "Dockerfile",
    ".py",
    ".h",
    ".c",
    ".cpp",
    ".java",
    ".go",
    ".rs",
    ".scala",
    ".sql",
    ".bash",
    ".zsh",
    ".sh",
    ".ps1",
    ".bat",
  ],

  folderHandle,
  trpcClient,
  dryRun,
});

function NewPlan({ onNewGoal }: { onNewGoal: (goal: string) => void }) {
  const formRef = useRef<{
    reset: () => void;
    setValue: (name: "goal", value: unknown, options?: SetValueConfig) => void;
  } | null>(null);
  const [open, setOpen] = useState(false);

  useAddVoiceStatus(
    `
The user currently has a modal open to create a new change plan. They are currently need to enter a new goal for Nova to start generating a plan.
  `.trim(),
    VoiceStatusPriority.HIGH,
    open,
  );

  useAddVoiceFunction(
    "propose_plan_goal",
    "Propose a new goal. Example: 'Change the color of the navigation bar to purple'. The more detailed the goal, the better and feel free to use markdown.",
    z.object({ goal: z.string().min(1) }),
    ({ goal }) => {
      formRef.current?.setValue("goal", goal, { shouldDirty: true });
    },
    open,
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button>New Plan</Button>
      </Dialog.Trigger>
      <Dialog.Content width="400px">
        <Dialog.Title>New Plan</Dialog.Title>
        <ZodForm
          formRef={formRef}
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

export function SpaceEditor({
  projectName,
  projectId,
  spaceId,
}: {
  projectName: string;
  projectId: string;
  spaceId: string;
}) {
  const trpcClient = trpc.useUtils().client;
  const [dryRun, setDryRun] = useState(false);

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
      !!selectedPage?.graphData && handle.result
        ? GraphRunner.fromData(getProjectContext(projectId, handle.result, trpcClient, dryRun), selectedPage.graphData)
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!selectedPage?.graphData, selectedPageId, handle.result, refreshIndex, dryRun],
  );
  (window as any).graphRunner = graphRunner; // for debugging
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

  useAddVoiceStatus(
    `
Currently working on the project "${projectName}".
  `.trim(),
  );

  if (!handle.result || pagesAsync.loading) return <Loader fill />;
  return (
    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
      <Pane minSize={15} className={stack({ bg: "background.primary" })}>
        {selectedPage?.graphData ? (
          <GraphCanvas
            graphData={selectedPage.graphData}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            actions={
              <Flex css={{ alignItems: "center", gap: 24 }}>
                <label>
                  <Flex css={{ alignItems: "center", gap: 8 }}>
                    <Checkbox
                      disabled={runGraph.loading}
                      checked={dryRun}
                      onCheckedChange={(c) => setDryRun(c === true)}
                    />
                    Dry Run
                  </Flex>
                </label>

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
              </Flex>
            }
          />
        ) : (
          <Stack css={{ alignItems: "center", justifyContent: "center", height: "100%" }}>
            <NewPlan
              onNewGoal={(goal) => {
                const graphData = GraphRunner.fromGoal(
                  getProjectContext(projectId, handle.result!, trpcClient, dryRun),
                  goal,
                ).toData();
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
            graphData={selectedPage?.graphData!}
            graphRunner={graphRunner}
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
                <TraceElementView key={i} trace={trace} graphRunner={graphRunner} />
              ))}
            </VList>
          </Stack>
        )}
      </Pane>
    </SplitPane>
  );
}
