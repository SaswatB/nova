import { orRef } from "streamweave-core";
import { z } from "zod";

import { swNode } from "../swNode";

export const OutputNNode = swNode
  .input(z.object({ description: z.string(), value: orRef(z.unknown()) }))
  .runnable(async (value, nrc) => {
    console.log("[OutputNode] ", value.description, value.value);
    await nrc.effects.displayToast({ message: `[OutputNode] ${value.value}`, type: "info", autoClose: false });
    return {};
  });
