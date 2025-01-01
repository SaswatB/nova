import { swEffect } from "../swEffect";

export const AIWebSearchNEffect = swEffect
  .runnableAnd((query: string, { effectContext, signal }) =>
    effectContext.trpcClient.ai.webSearch.mutate({ query }, { signal }),
  )
  .cacheable(); // todo expire cache results?
