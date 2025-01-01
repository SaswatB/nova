import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button, Tabs } from "@radix-ui/themes";
import { startCase } from "lodash";
import {
  GraphRunnerData,
  resolveNodeValueRefs,
  ResolveSwNodeRefs,
  SwNodeInstance,
  SwNodeResult,
  SwNodeValue,
} from "streamweave-core";
import { css } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";

import { formatError } from "../lib/err";
import { saveJsonToFile } from "../lib/files";
import { ApplyFileChangesNNodeRender } from "../lib/nodes/defs/ApplyFileChangesNNode.render";
import { ContextNNodeRender } from "../lib/nodes/defs/ContextNNode.render";
import { ExecuteNNodeRender } from "../lib/nodes/defs/ExecuteNNode.render";
import { OutputNNodeRender } from "../lib/nodes/defs/OutputNNode.render";
import { PlanNNodeRender } from "../lib/nodes/defs/PlanNNode.render";
import { ProjectAnalysisNNodeRender } from "../lib/nodes/defs/ProjectAnalysisNNode.render";
import { RelevantFileAnalysisNNodeRender } from "../lib/nodes/defs/RelevantFileAnalysisNNode.render";
import { TypescriptDepAnalysisNNodeRender } from "../lib/nodes/defs/TypescriptDepAnalysisNNode.render";
import { WebResearchHelperNNodeRender } from "../lib/nodes/defs/WebResearchHelperNNode.render";
import { WebResearchOrchestratorNNodeRender } from "../lib/nodes/defs/WebResearchOrchestratorNNode.render";
import { WebScraperNNodeRender } from "../lib/nodes/defs/WebScraperNNode.render";
import { GraphRunner } from "../lib/nodes/swRunner";
import { TraceElementList, traceElementSourceSymbol } from "./TraceElementView";
import { createImagesField, createTextAreaRefArrayField, createTextAreaRefField, ZodForm } from "./ZodForm";

const nodeRenderMap: {
  [NodeTypeId in keyof GraphRunner["nodeMap"]]: {
    renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<GraphRunner["nodeMap"][NodeTypeId]>>) => React.ReactNode;
    renderResult: (
      result: SwNodeResult<GraphRunner["nodeMap"][NodeTypeId]>,
      inputs: ResolveSwNodeRefs<SwNodeValue<GraphRunner["nodeMap"][NodeTypeId]>>,
    ) => React.ReactNode;
  };
} = {
  applyFileChanges: ApplyFileChangesNNodeRender,
  context: ContextNNodeRender,
  execute: ExecuteNNodeRender,
  output: OutputNNodeRender,
  plan: PlanNNodeRender,
  projectAnalysis: ProjectAnalysisNNodeRender,
  relevantFileAnalysis: RelevantFileAnalysisNNodeRender,
  typescriptDepAnalysis: TypescriptDepAnalysisNNodeRender,
  webResearchHelper: WebResearchHelperNNodeRender,
  webResearchOrchestrator: WebResearchOrchestratorNNodeRender,
  webScraper: WebScraperNNodeRender,
};

const CollapsibleContent = styled("div", {
  base: {
    minHeight: "100px",
    overflow: "hidden",
    position: "relative",
  },
  variants: {
    hideInput: {
      true: {
        maxHeight: "100px",
      },
      false: {
        maxHeight: "none",
      },
    },
    isOverflowing: {
      true: {
        "&::after": {
          content: '""',
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "20px",
          background: "linear-gradient(transparent, var(--colors-background-secondary))",
          opacity: 1,
        },
      },
      false: {
        "&::after": {
          opacity: 0,
        },
      },
    },
  },
});

export function NodeViewer({
  graphData,
  graphRunner,
  isGraphRunning,
  node,
  onChangeNode,
  onNodeNav,
}: {
  graphData: GraphRunnerData;
  graphRunner?: GraphRunner;
  isGraphRunning: boolean;
  node: SwNodeInstance;
  onChangeNode: (apply: (draft: SwNodeInstance) => void) => Promise<void> | void;
  onNodeNav: (node: SwNodeInstance) => void;
}) {
  const [editInput, setEditInput] = useState(false);
  const [hideInput, setHideInput] = useState(true);
  const [isContentOverflowing, setIsContentOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const nodeDef = useMemo(() => graphRunner?.getNodeDef(node), [graphRunner, node]);

  const [nodeInputs, nodeOutputs] = useMemo(() => {
    try {
      const value = resolveNodeValueRefs(node.value, graphData.nodeInstances);
      const renderer = nodeRenderMap[node.typeId as keyof typeof nodeRenderMap];
      return [
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        renderer?.renderInputs(value as any) ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        node.state?.result ? renderer?.renderResult(node.state.result, value as any) : "No state yet",
      ];
    } catch (e) {
      const error = formatError(e);
      return [error, error];
    }
  }, [node.typeId, node.value, graphData, node.state?.result]);

  useEffect(() => {
    if (contentRef.current) {
      setIsContentOverflowing(contentRef.current.scrollHeight > contentRef.current.clientHeight);
    }
  }, [nodeInputs]);

  const handleExport = async () => {
    if (!graphRunner) {
      toast.error("No graph runner");
      return;
    }
    try {
      const nodeData = graphRunner.exportNode(node.id);
      const filename = `node_${node.id}_${node.typeId}.json`;
      await saveJsonToFile(filename, nodeData);
      toast.success("Node exported successfully");
    } catch (error) {
      console.error("Error exporting node:", error);
      toast.error("Failed to export node");
    }
  };

  return (
    <Stack css={{ p: 24, pb: 0, gap: 0, minH: "100%", overflowY: "auto" }}>
      <Flex css={{ gap: 8 }}>
        {startCase(node.typeId)}
        <styled.div css={{ flex: 1 }} />
        <Button color="blue" variant="soft" onClick={handleExport}>
          Export
        </Button>
        <Button color="red" variant="soft" disabled={isGraphRunning} onClick={() => graphRunner?.deleteNode(node.id)}>
          Delete
        </Button>
        <Button
          color="red"
          variant="soft"
          disabled={!node.state || isGraphRunning}
          onClick={() => graphRunner?.resetNode(node.id)}
        >
          Reset
        </Button>
      </Flex>
      <Tabs.Root defaultValue="details" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        <Tabs.List className={css({ mb: 8 })}>
          <Tabs.Trigger value="details">Details</Tabs.Trigger>
          <Tabs.Trigger value="trace">Trace</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="details">
          {nodeInputs ? (
            <>
              <Flex>
                <styled.div css={{ mb: 8 }}>Inputs</styled.div>
                <styled.div css={{ flex: 1 }} />
                <Flex css={{ gap: 8 }}>
                  {hideInput ? null : editInput ? (
                    <Button variant="soft" size="1" color="red" onClick={() => setEditInput(false)}>
                      Cancel
                    </Button>
                  ) : (
                    <Button variant="soft" size="1" onClick={() => setEditInput(true)}>
                      Edit
                    </Button>
                  )}
                  {editInput ? null : (
                    <Button variant="soft" size="1" onClick={() => setHideInput(!hideInput)}>
                      {hideInput ? "Expand" : "Show Less"}
                    </Button>
                  )}
                </Flex>
              </Flex>
              {!nodeDef ? null : editInput ? (
                <ZodForm
                  schema={nodeDef.inputSchema}
                  defaultValues={node.value}
                  overrideFieldMap={{
                    type: () => null,
                    description: createTextAreaRefField(graphData),
                    value: () => null,
                    goal: createTextAreaRefField(graphData),
                    instructions: createTextAreaRefField(graphData),
                    relevantFiles: createTextAreaRefArrayField(graphData),
                    rawChangeSet: createTextAreaRefField(graphData),
                    path: createTextAreaRefField(graphData),
                    changes: createTextAreaRefField(graphData),
                    context: createTextAreaRefField(graphData),
                    images: createImagesField(),
                  }}
                  onSubmit={async (values) => {
                    await onChangeNode((draft) => {
                      draft.value = values;
                    });
                    setEditInput(false);
                    toast.success("Node updated");
                  }}
                  saveButtonText="Save & Reset Node"
                />
              ) : (
                <CollapsibleContent
                  ref={contentRef}
                  hideInput={hideInput}
                  isOverflowing={hideInput && isContentOverflowing}
                  onClick={() => setHideInput(false)}
                >
                  <Stack>{nodeInputs}</Stack>
                </CollapsibleContent>
              )}
            </>
          ) : null}
          {nodeInputs && nodeOutputs ? <styled.hr css={{ border: "1px solid #333", my: 8 }} /> : null}

          {nodeOutputs ? (
            <>
              <styled.div css={{ mb: 8 }}>Outputs</styled.div>
              <Stack>{nodeOutputs}</Stack>
            </>
          ) : null}
        </Tabs.Content>
        <Tabs.Content value="trace" style={{ flex: 1 }}>
          <TraceElementList
            trace={(node.state?.trace || []).map((t) => ({ ...t, [traceElementSourceSymbol]: node }))}
            graphRunner={graphRunner}
            onNodeNav={onNodeNav}
          />
        </Tabs.Content>
      </Tabs.Root>
    </Stack>
  );
}
