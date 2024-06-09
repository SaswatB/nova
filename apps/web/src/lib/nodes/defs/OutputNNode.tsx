import { toast } from "react-toastify";
import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { createNodeDef } from "../node-types";
import { orRef } from "../ref-types";

export const OutputNNode = createNodeDef(
  "output",
  z.object({ description: z.string(), value: orRef(z.unknown()) }),
  z.object({}),
  {
    run: async (value) => {
      console.log("[OutputNode] ", value.description, value.value);
      toast.info(`[OutputNode] ${value.value}`, { autoClose: false });
      return {};
    },
    renderInputs: (v) => <Well title={v.description}>{JSON.stringify(v.value, null, 2)}</Well>,
    renderResult: () => null,
  },
);
