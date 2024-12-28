import { swEffect } from "../swEffect";

export const AIWebSearchNEffect = swEffect
  .runnableAnd((query: string, { effectContext, signal }) =>
    effectContext.trpcClient.ai.webSearch.mutate({ query }, { signal }),
  )
  .cacheable(); // todo expire cache results?

// renderRequestTrace: (query) => <Well title="AI Web Search Request">{query}</Well>,
// //  todo make this prettier
// renderResultTrace: (result) => renderJsonWell("AI Web Search Result", result),
