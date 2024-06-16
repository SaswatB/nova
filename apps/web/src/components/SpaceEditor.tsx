import { useEffect, useMemo, useState } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { useBlocker, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { Button, Checkbox, Dialog, SegmentedControl, TextArea } from "@radix-ui/themes";
import * as idb from "idb-keyval";
import { produce } from "immer";
import { uniqBy } from "lodash";
import { Pane } from "split-pane-react";
import SplitPane from "split-pane-react/esm/SplitPane";
import { Flex, Stack, styled } from "styled-system/jsx";
import { stack } from "styled-system/patterns";
import { VList } from "virtua";
import { z } from "zod";

import { asyncToArray, dirname, IterationMode, VoiceStatusPriority } from "@repo/shared";

import { getFileHandleForPath } from "../lib/browser-fs";
import { formatError } from "../lib/err";
import { useLocalStorage } from "../lib/hooks/useLocalStorage";
import { useUpdatingRef } from "../lib/hooks/useUpdatingRef";
import { ExecuteNNode } from "../lib/nodes/defs/ExecuteNNode";
import { PlanNNode } from "../lib/nodes/defs/PlanNNode";
import { ProjectContext } from "../lib/nodes/node-types";
import { PROJECT_RULES, SUPPORTED_EXTENSIONS, SYSTEM_PROMPT } from "../lib/nodes/projectctx-constants";
import { GraphRunner, GraphRunnerData, GraphTraceEvent, NNode } from "../lib/nodes/run-graph";
import { routes } from "../lib/routes";
import { AppTRPCClient, trpc } from "../lib/trpc-client";
import { newId } from "../lib/uid";
import { Loader } from "./base/Loader";
import { GraphCanvas } from "./GraphCanvas";
import { NodeViewer } from "./NodeViewer";
import { RevertFilesDialog } from "./RevertFilesDialog";
import { TraceElementList, traceElementSourceSymbol } from "./TraceElementView";
import { useAddVoiceFunction, useAddVoiceStatus } from "./VoiceChat";
import { textAreaField, ZodForm, ZodFormRef } from "./ZodForm";

const getProjectContext = (
  projectId: string,
  folderHandle: FileSystemDirectoryHandle,
  trpcClient: AppTRPCClient,
  dryRun: boolean,
): ProjectContext => ({
  systemPrompt: SYSTEM_PROMPT,
  rules: PROJECT_RULES,
  extensions: SUPPORTED_EXTENSIONS,

  trpcClient,
  dryRun,

  ensureFS: async () => {
    if ((await folderHandle.queryPermission({ mode: "readwrite" })) !== "granted")
      if ((await folderHandle.requestPermission({ mode: "readwrite" })) !== "granted")
        throw new Error("Permission denied");
  },
  readFile: async (path) => {
    const handle = await getFileHandleForPath(path, folderHandle);
    if (!handle) return { type: "not-found" };
    if (handle.kind === "file") return { type: "file", content: await (await handle.getFile()).text() };
    return { type: "directory", files: await asyncToArray(handle.keys()) };
  },
  writeFile: async (path, content) => {
    const dir = dirname(path);
    const dirHandle = await getFileHandleForPath(dir, folderHandle, true);
    if (dirHandle?.kind !== "directory") throw new Error(`Directory not found: ${dir}`);

    const name = path.split("/").at(-1)!;
    const fileHandle = await dirHandle.getFileHandle(name, { create: true });
    const originalContent = await (await fileHandle.getFile()).text();
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return originalContent;
  },

  idbGet: (key) => idb.get(`project-${projectId}:graph-cache:${key}`),
  idbSet: (key, value) => idb.set(`project-${projectId}:graph-cache:${key}`, value),
  displayToast: toast,
  showRevertFilesDialog: (paths) => RevertFilesDialog({ paths }),
});

const NewPlanSchema = z.object({ goal: z.string().min(1) });
function NewPlan({ onNewGoal }: { onNewGoal: (goal: string) => void }) {
  const [form, setForm] = useState<ZodFormRef<z.infer<typeof NewPlanSchema>> | null>(null);
  const [open, setOpen] = useState(false);

  // super ugly hack, idk a better way
  const [goal, setGoal] = useState("");
  useEffect(() => {
    if (!open || !form) return;
    const intervalId = setInterval(() => setGoal(form.getValue("goal") || ""), 500);
    return () => clearInterval(intervalId);
  }, [open, form]);

  useAddVoiceStatus(
    `
The user currently has a modal open to create a new change plan.
They are currently need to enter a new goal for Nova to start generating a plan.
${goal ? `The currently entered goal is: ${goal}` : ""}
  `.trim(),
    VoiceStatusPriority.HIGH,
    open,
  );

  useAddVoiceFunction(
    "propose_plan_goal",
    "Propose a new goal. Example: 'Change the color of the navigation bar to purple. Look at NavBar.tsx for a reference.'. The more detailed the goal, the better and feel free to use markdown. Make sure to include all the context that the user provides.",
    z.object({ goal: z.string().min(1) }),
    ({ goal }) => {
      form?.setValue("goal", goal, { shouldDirty: true });
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
          formRef={setForm}
          schema={NewPlanSchema}
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

function xmlGraphDataPrompt(graphData: GraphRunnerData) {
  const planNode = Object.values(graphData.nodes).find(
    (n): n is NNode<typeof PlanNNode> => n.typeId === PlanNNode.typeId,
  );
  const executeNode = Object.values(graphData.nodes).find(
    (n): n is NNode<typeof ExecuteNNode> => n.typeId === ExecuteNNode.typeId,
  );
  return `
<graph_data>
<user_provided_goal>
${planNode?.value.goal}
</user_provided_goal>
<generated_plan>
${planNode?.state?.result?.result || "No plan generated yet."}
</generated_plan>
<generated_change_set>
${executeNode?.state?.result?.result.rawChangeSet || "No change set generated yet."}
</generated_change_set>
</graph_data>
  `.trim();
}

function IterationPane({
  graphData,
  onIterate,
  onClose,
}: {
  graphData: GraphRunnerData;
  onIterate: (prompt: string, iterationMode: IterationMode) => Promise<void>;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [iterationMode, setIterationMode] = useState<IterationMode>(IterationMode.MODIFY_CHANGE_SET);

  const onIterateAsync = useAsyncCallback(async () => {
    try {
      await onIterate(prompt, iterationMode);
    } catch (error) {
      console.error(error);
      toast.error(`Error applying iteration: ${formatError(error)}`);
    }
  });

  const iterationModeExplanations: Record<IterationMode, string> = {
    // [IterationMode.AUTO]: "Nova will automatically choose the best mode for the current task.",
    [IterationMode.MODIFY_PLAN]: "Nova will add context to the plan generation to modify the generated plan.",
    [IterationMode.MODIFY_CHANGE_SET]:
      "Nova will add context to the change set generation to modify the generated change set.",
  };

  useAddVoiceStatus(
    `
${xmlGraphDataPrompt(graphData)}

The user is currently has the iteration pane open.
The iteration pane is a form that allows the user to enter a prompt which they can use to modify the graph and add feedback as well as additional context based on how a previous Nova run went.
There are ${Object.keys(iterationModeExplanations).length} iteration modes:
${Object.entries(iterationModeExplanations)
  .map(([mode, explanation]) => `- ${mode}: ${explanation}`)
  .join("\n")}
The current iteration mode is: ${iterationMode}.
${prompt ? `The current iteration prompt is: ${prompt}.` : ""}
  `.trim(),
    VoiceStatusPriority.MEDIUM,
  );

  useAddVoiceFunction(
    "propose_iteration_prompt",
    "Propose a new iteration prompt. Example: 'Do not make any changes to the navigation bar. Reference App.tsx instead for the current router implementation.'. The more detailed the prompt, the better and feel free to use markdown. Make sure to include all the context that the user provides.",
    z.object({ prompt: z.string().min(1) }),
    ({ prompt }) => setPrompt(prompt),
  );

  return (
    <Stack css={{ bg: "background.secondary", p: 16, borderRadius: 8 }}>
      <label>Iteration Prompt</label>
      <TextArea autoFocus rows={10} value={prompt} onChange={(e) => setPrompt(e.target.value)} resize="both" />
      <SegmentedControl.Root value={iterationMode} onValueChange={(value) => setIterationMode(value as IterationMode)}>
        {/* <SegmentedControl.Item value={IterationMode.AUTO} title="Automatically choose an iteration mode">
          Auto
        </SegmentedControl.Item> */}
        <SegmentedControl.Item value={IterationMode.MODIFY_PLAN}>Modify Plan</SegmentedControl.Item>
        <SegmentedControl.Item value={IterationMode.MODIFY_CHANGE_SET}>Modify Change Set</SegmentedControl.Item>
        {/* <SegmentedControl.Item value={IterationMode.MODIFY_FILE}>Modify File</SegmentedControl.Item> */}
        {/* <SegmentedControl.Item value="newPlan">New Plan</SegmentedControl.Item> */}
      </SegmentedControl.Root>
      <Flex css={{ justifyContent: "space-between" }}>
        <Button disabled={onIterateAsync.loading} color="red" onClick={onClose}>
          Cancel
        </Button>
        <Button loading={onIterateAsync.loading} onClick={onIterateAsync.execute}>
          Iterate
        </Button>
      </Flex>
    </Stack>
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
  pageId,
}: {
  projectName: string;
  projectId: string;
  spaceId: string;
  pageId?: string;
}) {
  const navigate = useNavigate();

  const trpcClient = trpc.useUtils().client;
  const [dryRun, setDryRun] = useLocalStorage("dryRun", false);
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

  const selectedPage = pagesRef.current?.find((page) => page.id === pageId);

  // track the last page id for this space
  const [lastPageId, setLastPageId] = useLocalStorage<string | null>(`space:${spaceId}:lastPageId`, null);
  useEffect(() => {
    if (selectedPage) setLastPageId(selectedPage.id);
  }, [selectedPage, setLastPageId]);

  // navigate to the last page if no page is selected
  useEffect(() => {
    if (selectedPage) return;
    const newPageId = lastPageId || pagesAsync.result?.at(-1)?.id;
    if (!newPageId) return;
    navigate(routes.projectSpacePage.getPath({ projectId, spaceId, pageId: newPageId }), { replace: true });
  }, [selectedPage, navigate, projectId, spaceId, pagesAsync.result, lastPageId]);

  const [iterationActive, setIterationActive] = useState(false);

  const graphRunner = useMemo(
    () =>
      !!selectedPage?.graphData && handle.result
        ? GraphRunner.fromData(getProjectContext(projectId, handle.result, trpcClient, dryRun), selectedPage.graphData)
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!selectedPage?.graphData, pageId, handle.result, dryRun],
  );
  (window as any).graphRunner = graphRunner; // for debugging
  useEffect(() => {
    if (!graphRunner) return;
    let cancelled = false;

    graphRunner.on("dataChanged", () => {
      if (cancelled) return;
      setPages(
        produce((draft) => {
          const page = draft.find((p) => p.id === pageId);
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

  // block browser navigation when Nova is running
  useBlocker(() => {
    if (runGraph.loading) {
      toast.warn("Nova is currently running.");
      return true;
    }
    return false;
  });
  useEffect(() => {
    if (!runGraph.loading) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      toast.warn("Nova is currently running.");
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [runGraph.loading]);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const selectedNode = useMemo(
    () => selectedNodeId && selectedPage?.graphData?.nodes[selectedNodeId],
    [selectedPage?.graphData?.nodes, selectedNodeId],
  );

  useAddVoiceStatus(
    `
${selectedPage?.graphData ? xmlGraphDataPrompt(selectedPage.graphData) : ""}

Currently working on the project "${projectName}".
  `.trim(),
    VoiceStatusPriority.LOW,
  );

  if (!handle.result || pagesAsync.loading) return <Loader fill />;
  return (
    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
      <Pane minSize={15} className={stack({ bg: "background.primary" })}>
        {selectedPage?.graphData ? (
          <GraphCanvas
            graphData={selectedPage.graphData}
            isGraphRunning={runGraph.loading}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            topLeftActions={
              iterationActive ? (
                <IterationPane
                  graphData={selectedPage.graphData}
                  onClose={() => setIterationActive(false)}
                  onIterate={async (prompt, iterationMode) => {
                    await graphRunner?.iterate(prompt, iterationMode);
                    setIterationActive(false);
                  }}
                />
              ) : (
                <Flex css={{ alignItems: "center", gap: 24 }}>
                  {/* <Select
                    options={pagesRef.current?.map((page) => ({ label: page.name, value: page.id })) || []}
                    value={selectedPage.id}
                    onChange={(value) =>
                      navigate(routes.projectSpacePage.getPath({ projectId, spaceId, pageId: value }))
                    }
                  /> */}
                  <Button onClick={() => setIterationActive(!iterationActive)}>Iterate</Button>
                </Flex>
              )
            }
            topRightActions={
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
                  setPages((p) => [...p, { id, name: `Iteration ${p.length + 1}`, graphData }]);
                  navigate(routes.projectSpacePage.getPath({ projectId, spaceId, pageId: id }), { replace: true });
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
            isGraphRunning={runGraph.loading}
            node={selectedNode}
            onChangeNode={(apply) => graphRunner?.editNode(selectedNode.id, apply)}
            onNodeNav={(node) => setSelectedNodeId(node.id)}
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
              <TraceElementList
                trace={[
                  ...selectedPage.graphData.trace,
                  ...uniqBy(
                    selectedPage.graphData.trace.filter(
                      (t): t is GraphTraceEvent & { type: "start-node" } => t.type === "start-node",
                    ),
                    "node.id",
                  ).flatMap((t) =>
                    (selectedPage.graphData?.nodes[t.node.id]?.state?.trace || []).map((tr) => ({
                      ...tr,
                      [traceElementSourceSymbol]: selectedPage.graphData!.nodes[t.node.id]!,
                    })),
                  ),
                ]}
                graphRunner={graphRunner}
                onNodeNav={(node) => setSelectedNodeId(node.id)}
              />
            </VList>
          </Stack>
        )}
      </Pane>
    </SplitPane>
  );
}
