import { useState } from "react";
import { toast } from "react-toastify";
import { Button, Tabs, TextArea } from "@radix-ui/themes";
import { reverse, startCase } from "lodash";
import { css } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";
import { match, P } from "ts-pattern";

import { NNodeType, NNodeValue } from "../lib/prototype/nodes/node-types";
import { GraphRunner, GraphRunnerData, NNode, resolveNodeRefOrValue } from "../lib/prototype/nodes/run-graph";
import { Well } from "./base/Well";
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
  const { trace, ...otherState } = node.state || {};
  const [editInput, setEditInput] = useState(false);
  const [hideInput, setHideInput] = useState(false);

  const renderNodeInputs = () =>
    match(node.value)
      .with({ type: NNodeType.Output }, (v) => (
        <Well title={v.description}>{JSON.stringify(resolveNodeRefOrValue(v.value, graphData), null, 2)}</Well>
      ))
      .with({ type: NNodeType.ProjectAnalysis }, () => null)
      .with({ type: P.union(NNodeType.RelevantFileAnalysis, NNodeType.Plan) }, (v) => (
        <Well title="Goal">{resolveNodeRefOrValue(v.goal, graphData) || ""}</Well>
      ))
      .with({ type: NNodeType.TypescriptDepAnalysis }, () => null)
      .with({ type: NNodeType.Execute }, (v) => (
        <>
          <Well title="Instructions" markdown>
            {resolveNodeRefOrValue(v.instructions, graphData) || ""}
          </Well>
          <Well title="Relevant Files">
            {resolveNodeRefOrValue(v.relevantFiles, graphData)
              ?.map((file) => file)
              .join("\n") || ""}
          </Well>
        </>
      ))
      .with({ type: NNodeType.CreateChangeSet }, (v) => (
        <Well title="Raw Change Set" markdown>
          {resolveNodeRefOrValue(v.rawChangeSet, graphData) || ""}
        </Well>
      ))
      .with({ type: NNodeType.ApplyFileChanges }, (v) => (
        <Well title="Changes" markdown>
          {resolveNodeRefOrValue(v.changes, graphData)
            ?.map((change) => change)
            .join("\n") || ""}
        </Well>
      ))
      .exhaustive();

  const renderNodeOutputs = () =>
    match(node.state?.result)
      .with(undefined, () => "No state yet")
      .with({ type: NNodeType.Output }, () => null)
      .with({ type: NNodeType.ProjectAnalysis }, (res) => (
        <>
          <Well title="Research" markdown>
            {res.result.research}
          </Well>
          <Well title="Files" markdown>
            {/* todo maybe allow looking at individual files? */}
            {`${res.result.files.length} source files processed`}
          </Well>
        </>
      ))
      .with({ type: NNodeType.RelevantFileAnalysis }, (res) => (
        <>
          <Well title="Result" markdown>
            {res.result}
          </Well>
          <Well title="Files">{res.files.join("\n")}</Well>
        </>
      ))
      .with({ type: NNodeType.TypescriptDepAnalysis }, () => null) // todo lm_ec44d16eee restore ts deps
      .with({ type: P.union(NNodeType.Plan, NNodeType.Execute) }, (res) => (
        <Well title="Result" markdown>
          {res.result}
        </Well>
      ))
      .with(
        { type: NNodeType.CreateChangeSet },
        (
          res, // todo maybe do this better by adding types to the result?
        ) => <Well title="Result">{JSON.stringify(res.result, null, 2)}</Well>,
      )
      .with({ type: NNodeType.ApplyFileChanges }, (res) => (
        <Well
          title="Result"
          markdown
          copyText={res.result}
        >{`\`\`\`${node.value.type === NNodeType.ApplyFileChanges ? resolveNodeRefOrValue(node.value.path, graphData)?.replace(/.*\./, "") || "" : ""}\n${res.result}\n\`\`\``}</Well>
      ))
      .exhaustive();

  const nodeInputs = renderNodeInputs();
  const nodeOutputs = renderNodeOutputs();

  return (
    <Stack css={{ p: 24, gap: 0, overflowY: "auto" }}>
      <Flex css={{ justifyContent: "space-between" }}>
        {startCase(node.value.type)}
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
              {hideInput ? null : editInput ? (
                <ZodForm
                  schema={NNodeValue.optionsMap.get(node.value.type)!}
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
                      draft.value = values as NNodeValue;
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
          {reverse(trace || []).map((t, i) => (
            <TraceElementView key={i} trace={{ ...t, [traceElementSourceSymbol]: node }} graphRunner={graphRunner} />
          )) || null}
        </Tabs.Content>
      </Tabs.Root>
    </Stack>
  );
}
