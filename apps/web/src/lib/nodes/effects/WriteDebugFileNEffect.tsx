import { swEffect } from "../swEffect";

export const WriteDebugFileNEffect = swEffect
  .runnableAnd(async ({ name, content }: { name: string; content: string }, { effectContext }) =>
    effectContext.writeDebugFile(name, content),
  )
  .callAlias((name: string, content: string) => ({ name, content }));
