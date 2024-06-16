import { z } from "zod";

import { renderJsonWell } from "../../../components/base/Well";
import { createNodeDef } from "../node-types";
import { orRef } from "../ref-types";

export const OutputNNode = createNodeDef(
  "output",
  z.object({ description: z.string(), value: orRef(z.unknown()) }),
  z.object({}),
  {
    run: async (value, nrc) => {
      console.log("[OutputNode] ", value.description, value.value);
      nrc.projectContext.displayToast(`[OutputNode] ${value.value}`, { type: "info", autoClose: false });
      return {};
    },
    renderInputs: (v) => renderJsonWell(v.description, v.value),
    renderResult: () => null,
  },
);
