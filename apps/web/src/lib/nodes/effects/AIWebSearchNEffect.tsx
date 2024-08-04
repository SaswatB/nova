import { renderJsonWell, Well } from "../../../components/base/Well";
import { createNodeEffect } from "../effect-types";

export const AIWebSearchNEffect = createNodeEffect(
  {
    typeId: "ai-web-search",
    cacheable: true, // todo expire cache results
  },
  {
    async run(query: string, { projectContext, signal }) {
      return projectContext.trpcClient.ai.webSearch.mutate({ query }, { signal });
    },
    renderRequestTrace: (query) => <Well title="AI Web Search Request">{query}</Well>,
    //  todo make this prettier
    renderResultTrace: (result) => renderJsonWell("AI Web Search Result", result),
  },
);
