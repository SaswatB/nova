import { useEffect, useMemo, useRef, useState } from "react";
import { useAsync, useAsyncCallback } from "react-async-hook";
import { useBlocker, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { GearIcon } from "@radix-ui/react-icons";
import { Button, Dialog, DropdownMenu, IconButton, SegmentedControl, TextArea, Tooltip } from "@radix-ui/themes";
import * as idb from "idb-keyval";
import { produce } from "immer";
import { uniqBy } from "lodash";
import { Pane } from "split-pane-react";
import SplitPane from "split-pane-react/esm/SplitPane";
import { GraphRunnerData, SwNodeInstance } from "streamweave-core";
import { css } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";
import { stack } from "styled-system/patterns";
import { z } from "zod";

import { dirname, IterationMode, ProjectSettings, VoiceStatusPriority } from "@repo/shared";

import { getFileHandleForPath, opfsRootPromise, readFileHandle, writeFileHandle } from "../lib/browser-fs";
import { formatError } from "../lib/err";
import { useLocalStorage } from "../lib/hooks/useLocalStorage";
import { useUpdatingRef } from "../lib/hooks/useUpdatingRef";
import { onSubmitEnter } from "../lib/key-press";
import { idbKey, lsKey } from "../lib/keys";
import { ExecuteNNode } from "../lib/nodes/defs/ExecuteNNode";
import { PlanNNode, PlanNNodeValue } from "../lib/nodes/defs/PlanNNode";
import { ProjectContext } from "../lib/nodes/project-ctx";
import { GraphRunner, swRunner } from "../lib/nodes/swRunner";
import { routes } from "../lib/routes";
import { AppTRPCClient, trpc } from "../lib/trpc-client";
import { newId } from "../lib/uid";
import { Loader } from "./base/Loader";
import { GraphCanvas } from "./GraphCanvas";
import { NodeViewer } from "./NodeViewer";
import { RevertChangesDialog } from "./RevertChangesDialog";
import { TraceElementList, traceElementSourceSymbol } from "./TraceElementView";
import { useAddVoiceFunction, useAddVoiceStatus } from "./VoiceChat";
import { createImagesField, createTextAreaField, ZodForm, ZodFormRef } from "./ZodForm";

const getProjectContext = (
  projectId: string,
  settings: ProjectSettings,
  folderHandle: FileSystemDirectoryHandle,
  trpcClient: AppTRPCClient,
  dryRun: boolean,
): ProjectContext => ({
  settings,
  trpcClient,
  dryRun,

  ensureFS: async () => {
    if ((await folderHandle.queryPermission({ mode: "readwrite" })) !== "granted")
      if ((await folderHandle.requestPermission({ mode: "readwrite" })) !== "granted")
        throw new Error("Permission denied");
  },
  readFile: (path) => readFileHandle(path, folderHandle),
  writeFile: async (path, content) => (await writeFileHandle(path, folderHandle, content, true)) || "",
  deleteFile: async (path) => {
    const fileHandle = await getFileHandleForPath(dirname(path), folderHandle);
    if (fileHandle?.kind !== "directory") throw new Error(`Directory not found: ${dirname(path)}`);
    const name = path.split("/").at(-1)!;
    await fileHandle.removeEntry(name);
  },

  // lm_a445fd9fd3 utilize a project folder within opfs for project-specific caching
  projectCacheGet: async (key) => {
    const opfsRoot = await opfsRootPromise;
    const content = await readFileHandle(`projects/${projectId}/${key}`, opfsRoot);
    return content.type === "file" ? JSON.parse(content.content) : undefined;
  },
  projectCacheSet: async (key, value) => {
    const opfsRoot = await opfsRootPromise;
    await writeFileHandle(`projects/${projectId}/${key}`, opfsRoot, JSON.stringify(value));
  },
  // global cache is still associated with the project, to make cleanup easy
  globalCacheGet: async (key) => {
    const opfsRoot = await opfsRootPromise;
    const content = await readFileHandle(`projects/${projectId}/global/${key}`, opfsRoot);
    return content.type === "file" ? JSON.parse(content.content) : undefined;
  },
  globalCacheSet: async (key, value) => {
    const opfsRoot = await opfsRootPromise;
    await writeFileHandle(`projects/${projectId}/global/${key}`, opfsRoot, JSON.stringify(value));
  },
  displayToast: toast,
  showRevertChangesDialog: (entries) => RevertChangesDialog({ entries }),
  writeDebugFile: () => Promise.resolve(), // noop
});

function detectURL(text: string): boolean {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return urlRegex.test(text);
}

function NewPlan({ onNewGoal }: { onNewGoal: (params: PlanNNodeValue, run: boolean) => void }) {
  const [form, setForm] = useState<ZodFormRef<PlanNNodeValue> | null>(null);
  const [open, setOpen] = useState(true);
  const [goal, setGoal] = useState("");
  const enabledWebResearchAutomaticallyRef = useRef(false);

  useEffect(() => {
    if (form && detectURL(goal) && !enabledWebResearchAutomaticallyRef.current) {
      form.setValue("enableWebResearch", true, { shouldDirty: true });
      enabledWebResearchAutomaticallyRef.current = true;
    }
  }, [form, goal]);

  useEffect(() => {
    if (!open || !form) return;
    const intervalId = setInterval(() => setGoal(`${form.getValue("goal") || ""}`), 500);
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

  const onSubmit = async (values: PlanNNodeValue | undefined = form?.getValues(), run = false) => {
    if (!values) return;
    onNewGoal(values, run);
    setOpen(false);
  };

  useAddVoiceFunction(
    "propose_plan_goal",
    "Propose a new goal. Example: 'Change the color of the navigation bar to purple. Look at NavBar.tsx for a reference.'. The more detailed the goal, the better and feel free to use markdown. Make sure to include all the context that the user provides.",
    z.object({ goal: z.string().min(1) }),
    ({ goal }) => {
      form?.setValue("goal", goal, { shouldDirty: true });
    },
    open,
  );

  useAddVoiceFunction(
    "run_goal",
    "Run the current goal. This should only be executed if the user explicitly requests to run the goal or plan.",
    z.object({ run: z.boolean() }),
    () => onSubmit(undefined, true),
    open,
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Button>New Change</Button>
      </Dialog.Trigger>
      <Dialog.Content width="600px">
        <Dialog.Title>New Change</Dialog.Title>
        <ZodForm
          formRef={setForm}
          schema={PlanNNode.inputSchema}
          defaultValues={{ enableWebResearch: false }}
          overrideFieldMap={{
            goal: createTextAreaField("Example: Change the color of the navigation bar to purple."),
            images: createImagesField(),
          }}
          onSubmit={async (v) => {
            await onSubmit(v, true);
            setOpen(false);
          }}
          saveButtonText={null}
        />
        <Flex css={{ justifyContent: "flex-end", mt: 12, gap: 4 }}>
          <Button variant="soft" onClick={() => onSubmit()}>
            Save
          </Button>
          <Button color="green" onClick={() => onSubmit(undefined, true)}>
            Save & Run
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

function xmlGraphDataPrompt(graphRunner: GraphRunner | undefined, graphData: GraphRunnerData) {
  if (!graphRunner) return "";

  const planNodeTypeId = graphRunner.getNodeTypeId(PlanNNode);
  const executeNodeTypeId = graphRunner.getNodeTypeId(ExecuteNNode);
  const planNode = Object.values(graphData.nodeInstances).find(
    (n): n is SwNodeInstance<typeof PlanNNode> => n.typeId === planNodeTypeId,
  );
  const executeNode = Object.values(graphData.nodeInstances).find(
    (n): n is SwNodeInstance<typeof ExecuteNNode> => n.typeId === executeNodeTypeId,
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
  graphRunner,
  graphData,
  onIterate,
  onClose,
}: {
  graphRunner: GraphRunner | undefined;
  graphData: GraphRunnerData;
  onIterate: (prompt: string, iterationMode: IterationMode, run: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [iterationMode, setIterationMode] = useState<IterationMode>(IterationMode.NEW_PLAN);

  const onIterateAsync = useAsyncCallback(async (run: boolean) => {
    try {
      await onIterate(prompt, iterationMode, run);
    } catch (error) {
      console.error(error);
      toast.error(`Error applying iteration: ${formatError(error)}`);
    }
  });

  const iterationModeExplanations: Record<IterationMode, string> = {
    // [IterationMode.AUTO]: "Nova will automatically choose the best mode for the current task.",
    [IterationMode.MODIFY_PLAN]: "Nova will reset the last plan generation and add context.",
    [IterationMode.MODIFY_CHANGE_SET]: "Nova will reset the last change set generation and add context.",
    [IterationMode.NEW_PLAN]: "Nova will add a new plan, which will have context from previous iterations.",
  };

  useAddVoiceStatus(
    `
${xmlGraphDataPrompt(graphRunner, graphData)}

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
      <TextArea
        autoFocus
        rows={10}
        value={prompt}
        className={css({ minWidth: 420 })}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={onSubmitEnter(() => onIterateAsync.execute(true))}
        resize="both"
      />
      <SegmentedControl.Root value={iterationMode} onValueChange={(value) => setIterationMode(value as IterationMode)}>
        {/* <SegmentedControl.Item value={IterationMode.AUTO} title="Automatically choose an iteration mode">
          Auto
        </SegmentedControl.Item> */}
        {/* <SegmentedControl.Item value={IterationMode.MODIFY_PLAN}>Modify Plan</SegmentedControl.Item> */}
        <SegmentedControl.Item value={IterationMode.MODIFY_CHANGE_SET}>Revise</SegmentedControl.Item>
        {/* <SegmentedControl.Item value={IterationMode.MODIFY_FILE}>Modify File</SegmentedControl.Item> */}
        <SegmentedControl.Item value={IterationMode.NEW_PLAN}>Add</SegmentedControl.Item>
      </SegmentedControl.Root>
      <styled.div css={{ fontSize: 12, color: "text.secondary" }}>
        {iterationModeExplanations[iterationMode]}
      </styled.div>
      <Flex css={{ gap: 8 }}>
        <Button disabled={onIterateAsync.loading} color="red" onClick={onClose}>
          Cancel
        </Button>
        <styled.div css={{ flex: 1 }} />
        <Button loading={onIterateAsync.loading} onClick={() => onIterateAsync.execute(false)}>
          Iterate
        </Button>
        <Button color="green" loading={onIterateAsync.loading} onClick={() => onIterateAsync.execute(true)}>
          Iterate & Run
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
  projectSettings,
  projectHandle,
  spaceId,
  pageId,
  onIsRunningChange,
  onNewPlan,
}: {
  projectName: string;
  projectId: string;
  projectSettings: ProjectSettings;
  projectHandle: FileSystemDirectoryHandle;
  spaceId: string;
  pageId?: string;
  onIsRunningChange: (isRunning: boolean) => void;
  onNewPlan: (goal: string) => void;
}) {
  const navigate = useNavigate();

  const trpcUtils = trpc.useUtils();
  const [dryRun, setDryRun] = useLocalStorage(lsKey.dryRun, false);
  const [sizes, setSizes] = useLocalStorage(lsKey.spaceSizes, [60, 40]);

  const pagesAsync = useAsync((spaceId: string) => idb.get<Page[]>(idbKey.spacePages(spaceId)), [spaceId]);
  const pagesRef = useUpdatingRef(pagesAsync.result);
  const setPages = (pages: Page[] | ((pages: Page[]) => Page[])) => {
    const newPages = typeof pages === "function" ? pages(pagesRef.current || []) : pages;
    pagesAsync.set({ status: "success", loading: false, error: undefined, result: newPages });
    pagesRef.current = newPages;
    void idb.set(idbKey.spacePages(spaceId), newPages).catch(console.error);
  };

  const selectedPage = pagesRef.current?.find((page) => page.id === pageId);

  // track the last page id for this space
  const [lastPageId, setLastPageId] = useLocalStorage(lsKey.spaceLastPage(spaceId), null);
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

  const projectContext = useMemo(
    () => getProjectContext(projectId, projectSettings, projectHandle, trpcUtils.client, dryRun),
    [projectId, projectHandle, trpcUtils, dryRun, projectSettings],
  );
  const swRunnerWithContext = useMemo(
    () => swRunner.effectContext(projectContext).nodeContext(projectSettings),
    [projectContext, projectSettings],
  );

  const graphRunner = useMemo(
    () => {
      if (!selectedPage?.graphData) return;
      return swRunnerWithContext.createFromData(selectedPage.graphData);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [!!selectedPage?.graphData],
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const runGraph = useAsyncCallback(async () => (graphRunner || undefined)?.run(), {
    onSuccess: () => toast.success("Nova finished running."),
    onError: (error) => {
      console.error(error);
      toast.error(error.message);
    },
  });
  const runGraphRef = useUpdatingRef(runGraph);
  const onIsRunningChangeRef = useUpdatingRef(onIsRunningChange);
  useEffect(() => onIsRunningChangeRef.current?.(runGraph.loading), [runGraph.loading, onIsRunningChangeRef]);

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
    () => selectedNodeId && selectedPage?.graphData?.nodeInstances[selectedNodeId],
    [selectedPage?.graphData?.nodeInstances, selectedNodeId],
  );

  const handleReSaveAllWrites = async () => {
    if (!graphRunner) {
      toast.error("Graph runner not initialized");
      return;
    }

    // try {
    //   await graphRunner.reSaveAllWrites();
    //   toast.success("All writes re-saved successfully");
    // } catch (error) {
    const error = new Error("Not implemented");
    console.error("Error re-saving writes:", error);
    toast.error(`Failed to re-save writes: ${formatError(error)}`);
    // }
  };

  useAddVoiceStatus(
    `
${selectedPage?.graphData ? xmlGraphDataPrompt(graphRunner, selectedPage.graphData) : ""}

Currently working on the project "${projectName}".
  `.trim(),
    VoiceStatusPriority.LOW,
  );

  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  useEffect(() => {
    if (!runGraph.loading) return;
    if (!("wakeLock" in navigator)) {
      console.warn("Wake Lock API is not supported in this browser");
      return;
    }

    const requestWakeLock = async () => {
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        console.log("Wake Lock is active");
      } catch (err) {
        console.error(`Failed to request Wake Lock: ${err}`);
        toast.error("Failed to keep the screen awake. The device may go to sleep during graph execution.");
      }
    };

    const releaseWakeLock = async () => {
      if (wakeLockRef.current) {
        try {
          await wakeLockRef.current.release();
          wakeLockRef.current = null;
          console.log("Wake Lock released");
        } catch (err) {
          console.error(`Failed to release Wake Lock: ${err}`);
          toast.error("Failed to release the wake lock. This may affect battery life.");
        }
      }
    };

    requestWakeLock().catch(console.error);
    return () => {
      releaseWakeLock().catch(console.error);
    };
  }, [runGraph.loading]);

  if (pagesAsync.loading) return <Loader fill />;
  return (
    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
      <Pane minSize={15} className={stack({ bg: "background.primary" })}>
        {selectedPage?.graphData && Object.keys(selectedPage?.graphData?.nodeInstances || {}).length ? (
          <GraphCanvas
            graphData={selectedPage.graphData}
            isGraphRunning={runGraph.loading}
            selectedNodeId={selectedNodeId}
            setSelectedNodeId={setSelectedNodeId}
            topLeftActions={
              iterationActive ? (
                <IterationPane
                  graphRunner={graphRunner}
                  graphData={selectedPage.graphData}
                  onClose={() => setIterationActive(false)}
                  onIterate={async (prompt, iterationMode) => {
                    // await graphRunner?.iterate(prompt, iterationMode);
                    toast.error("Not implemented");
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
                {!runGraph.loading ? (
                  <Tooltip content={graphRunner?.hasRunnableNodes() ? "Run the graph" : "Nothing to run"}>
                    <Button
                      color="green"
                      onClick={() => void runGraph.execute()}
                      disabled={!graphRunner?.hasRunnableNodes()}
                    >
                      Run
                    </Button>
                  </Tooltip>
                ) : (
                  <Button color="red" onClick={() => void graphRunner?.stopRun()}>
                    Stop
                  </Button>
                )}

                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    <IconButton variant="ghost">
                      <GearIcon />
                    </IconButton>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content>
                    <DropdownMenu.Item onSelect={handleReSaveAllWrites}>Re-save all writes</DropdownMenu.Item>
                    <DropdownMenu.Item onSelect={() => setDryRun(!dryRun)}>
                      {dryRun ? "Disable" : "Enable"} Dry Run
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </Flex>
            }
          />
        ) : projectContext ? (
          <Stack css={{ alignItems: "center", justifyContent: "center", height: "100%" }}>
            <NewPlan
              onNewGoal={(v, run) => {
                const runner = swRunnerWithContext.create();
                runner.addNode(PlanNNode, v);
                const graphData = runner.toData();
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
                if (run) setTimeout(() => void runGraphRef.current?.execute(), 300);
                onNewPlan(`${v.goal}`);
              }}
            />
          </Stack>
        ) : null}
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
            <styled.h2 css={{ fontSize: 16, fontWeight: "bold", mt: 8, ml: 16, py: 8 }}>Graph Trace</styled.h2>
            <TraceElementList
              trace={[
                ...selectedPage.graphData.trace,
                ...uniqBy(
                  selectedPage.graphData.trace.filter((t) => t.type === "start-node"),
                  "node.id",
                ).flatMap((t) =>
                  (selectedPage.graphData?.nodeInstances[t.ni.id]?.state?.trace || []).map((tr) => ({
                    ...tr,
                    [traceElementSourceSymbol]: selectedPage.graphData!.nodeInstances[t.ni.id]!,
                  })),
                ),
              ]}
              graphRunner={graphRunner}
              onNodeNav={(node) => setSelectedNodeId(node.id)}
            />
          </Stack>
        )}
      </Pane>
    </SplitPane>
  );
}
