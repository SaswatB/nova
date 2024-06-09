import { z } from "zod";

import { createNodeDef } from "../node-types";

export const TypescriptDepAnalysisNNode = createNodeDef(
  "typescript-dep-analysis",
  z.object({}),
  z.object({ result: z.record(z.array(z.object({ fileName: z.string().optional(), moduleSpecifier: z.string() }))) }),
  {
    run: async (value, nrc) => {
      // todo lm_ec44d16eee restore ts deps
      // const result = getDepTree(nrc.projectContext.);
      // console.log("[TypescriptDepAnalysis] ", result);
      return { result: {} };
    },
    renderInputs: () => null,
    renderResult: () => null, // todo lm_ec44d16eee restore ts deps
  },
);
