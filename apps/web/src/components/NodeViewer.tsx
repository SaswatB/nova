import { toast } from "react-toastify";
import { TextArea } from "@radix-ui/themes";
import { startCase } from "lodash";
import { Stack, styled } from "styled-system/jsx";

import { NNodeValue } from "../lib/prototype/nodes/node-types";
import { GraphRunnerData } from "../lib/prototype/nodes/run-graph";
import { ZodForm } from "./ZodForm";

export function NodeViewer({
  node,
  onChangeNode,
}: {
  node: GraphRunnerData["nodes"][number];
  onChangeNode: (apply: (draft: GraphRunnerData["nodes"][number]) => void) => void;
}) {
  return (
    <Stack>
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
    </Stack>
  );
}
