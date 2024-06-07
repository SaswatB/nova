import { toast } from "react-toastify";
import { TextArea } from "@radix-ui/themes";
import { reverse, startCase } from "lodash";
import { Stack, styled } from "styled-system/jsx";

import { NNodeValue } from "../lib/prototype/nodes/node-types";
import { GraphRunner, GraphRunnerData } from "../lib/prototype/nodes/run-graph";
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
  node: GraphRunnerData["nodes"][number];
  onChangeNode: (apply: (draft: GraphRunnerData["nodes"][number]) => void) => void;
}) {
  const { trace, ...otherState } = node.state || {};
  return (
    <Stack css={{ p: 24, overflowY: "auto" }}>
      {startCase(node.value.type)}
      <styled.hr css={{ border: "1px solid #333", my: 8 }} />
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
          toast.success("Node updated");
        }}
      />
      <styled.hr css={{ border: "1px solid #333", my: 8 }} />
      {otherState ? (
        <TextArea value={JSON.stringify(otherState, null, 2)} readOnly resize="vertical" rows={20} />
      ) : (
        "No state yet"
      )}
      {reverse(trace || []).map((t, i) => (
        <TraceElementView key={i} trace={{ ...t, [traceElementSourceSymbol]: node }} graphRunner={graphRunner} />
      )) || null}
    </Stack>
  );
}
