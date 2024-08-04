import { createNodeEffect } from "../effect-types";
import { NodeRunnerContext } from "../node-types";

export const WriteDebugFileNEffect = createNodeEffect(
  "write-debug-file",
  {
    async run({ name, content }: { name: string; content: string }, { projectContext }) {
      await projectContext.writeDebugFile(name, content);
    },
  },
  (nrc: NodeRunnerContext, name: string, content: string) => nrc.e$(WriteDebugFileNEffect, { name, content }),
);
