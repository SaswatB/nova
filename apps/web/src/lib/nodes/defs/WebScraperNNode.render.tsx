import { ResolveSwNodeRefs, SwNodeResult, SwNodeValue } from "streamweave-core";

import { Well } from "../../../components/base/Well";
import { WebScraperNNode } from "./WebScraperNNode";

export const WebScraperNNodeRender = {
  renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<typeof WebScraperNNode>>) => (
    <>
      <Well title="URL">{value.url}</Well>
      <Well title="Query">{value.query}</Well>
    </>
  ),
  renderResult: (result: SwNodeResult<typeof WebScraperNNode>) => (
    <>
      {result.title && <Well title="Title">{result.title}</Well>}
      <Well title="Relevant Information" markdownPreferred>
        {result.relevantInfo}
      </Well>
      <Well title="Key Points" markdownPreferred>
        {result.keyPoints.map((point, index) => `${index + 1}. ${point}`).join("\n")}
      </Well>
      <Well title="Code Snippets" markdownPreferred>
        {result.codeSnippets.map((snippet, index) => `Snippet ${index + 1}:\n${snippet}`).join("\n\n")}
      </Well>
      <Well title="Helpful Links" markdownPreferred>
        {result.helpfulLinks
          .map((link, index) => `${index + 1}. [${link.url}](${link.url})\n   Justification: ${link.justification}`)
          .join("\n\n")}
      </Well>
    </>
  ),
};
