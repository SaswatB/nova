import { toast } from "react-toastify";
import { TextArea } from "@radix-ui/themes";
import { startCase } from "lodash";
import { Stack, styled } from "styled-system/jsx";

import { NNodeValue } from "../lib/prototype/nodes/node-types";
import { GraphRunnerData } from "../lib/prototype/nodes/run-graph";
import { traceElementSourceSymbol, TraceElementView } from "./TraceElementView";
import { ZodForm } from "./ZodForm";

export function NodeViewer({
  node,
  onChangeNode,
}: {
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
        overrideFieldMap={{ type: () => null, goal: { renderField: ({ register }) => <TextArea {...register()} /> } }}
        onSubmit={(values) => {
          onChangeNode((draft) => {
            draft.value = values as NNodeValue;
          });
          toast.success("Node updated");
        }}
      />
      <styled.hr css={{ border: "1px solid #333", my: 8 }} />
      {otherState ? <TextArea value={JSON.stringify(otherState, null, 2)} rows={20} /> : "No state yet"}
      {trace?.map((t, i) => <TraceElementView key={i} trace={{ ...t, [traceElementSourceSymbol]: node }} />) || null}
    </Stack>
  );
}
