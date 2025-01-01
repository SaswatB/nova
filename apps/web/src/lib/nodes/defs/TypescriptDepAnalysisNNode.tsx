import { z } from "zod";

import { swNode } from "../swNode";

export const TypescriptDepAnalysisNNode = swNode
  .input(z.object({}))
  .output(
    z.object({ result: z.record(z.array(z.object({ fileName: z.string().optional(), moduleSpecifier: z.string() }))) }),
  )
  .runnable(async (value, nrc) => {
    // todo lm_ec44d16eee restore ts deps
    // const result = getDepTree(nrc.projectContext.);
    // console.log("[TypescriptDepAnalysis] ", result);
    return { result: {} };
  });
