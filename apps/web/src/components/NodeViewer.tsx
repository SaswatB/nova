import { useMemo, useState } from "react";
import { toast } from "react-toastify";
import { Button, Tabs } from "@radix-ui/themes";
import { reverse, sortBy, startCase } from "lodash";
import { css } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";

import { GraphRunner, GraphRunnerData, NNode, resolveNodeValueRefs } from "../lib/nodes/run-graph";
import { traceElementSourceSymbol, TraceElementView } from "./TraceElementView";
import { createTextAreaRefArrayField, createTextAreaRefField, ZodForm } from "./ZodForm";

export function NodeViewer({
  graphData,
  graphRunner,
  node,
  onChangeNode,
}: {
  graphData: GraphRunnerData;
  graphRunner?: GraphRunner;
  node: NNode;
  onChangeNode: (apply: (draft: NNode) => void) => void;
}) {
  const [editInput, setEditInput] = useState(false);
  const [hideInput, setHideInput] = useState(false);

  const nodeDef = useMemo(() => graphRunner?.getNodeDef(node), [graphRunner, node]);

  const nodeInputs = useMemo(
    () => nodeDef?.renderInputs(resolveNodeValueRefs(node.value, graphData.nodes)) ?? null,
    [nodeDef, node.value, graphData],
  );
  const nodeOutputs = useMemo(
    () => (node.state?.result ? nodeDef?.renderResult(node.state.result) : "No state yet"),
    [nodeDef, node.state],
  );

  return (
    <Stack css={{ p: 24, gap: 0, overflowY: "auto" }}>
      <Flex css={{ justifyContent: "space-between" }}>
        {startCase(node.typeId)}
        {node.state ? (
          <Button color="red" onClick={() => graphRunner?.resetNode(node.id)}>
            Reset
          </Button>
        ) : null}
      </Flex>
      <Tabs.Root defaultValue="details">
        <Tabs.List className={css({ mb: 8 })}>
          <Tabs.Trigger value="details">Details</Tabs.Trigger>
          <Tabs.Trigger value="trace">Trace</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="details">
          {nodeInputs ? (
            <>
              <Flex>
                <styled.div css={{ mb: hideInput ? 0 : 8 }}>Inputs</styled.div>
                <styled.div css={{ flex: 1 }} />
                <Flex css={{ gap: 8 }}>
                  {editInput ? null : hideInput ? (
                    <Button variant="soft" size="1" onClick={() => setHideInput(false)}>
                      Expand
                    </Button>
                  ) : (
                    <Button variant="soft" size="1" onClick={() => setHideInput(true)}>
                      Collapse
                    </Button>
                  )}
                  {hideInput ? null : editInput ? (
                    <Button variant="soft" size="1" color="red" onClick={() => setEditInput(false)}>
                      Cancel
                    </Button>
                  ) : (
                    <Button variant="soft" size="1" onClick={() => setEditInput(true)}>
                      Edit
                    </Button>
                  )}
                </Flex>
              </Flex>
              {hideInput || !nodeDef ? null : editInput ? (
                <ZodForm
                  schema={nodeDef.valueSchema}
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
                    changes: createTextAreaRefArrayField(graphData),
                  }}
                  onSubmit={(values) => {
                    onChangeNode((draft) => {
                      draft.value = values;
                    });
                    setEditInput(false);
                    toast.success("Node updated");
                  }}
                />
              ) : (
                <Stack>{nodeInputs}</Stack>
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
        <Tabs.Content value="trace">
          {reverse(sortBy(node.state?.trace || [], "timestamp")).map((t, i) => (
            <TraceElementView key={i} trace={{ ...t, [traceElementSourceSymbol]: node }} graphRunner={graphRunner} />
          )) || null}
        </Tabs.Content>
      </Tabs.Root>
    </Stack>
  );
}
