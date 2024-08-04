import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import { renderJsonWell, Well } from "../../../components/base/Well";
import { createNodeEffect } from "../effect-types";
import { NodeRunnerContext } from "../node-types";

export const AIScrapeNEffect = createNodeEffect(
  "ai-scrape",
  {
    run(
      { jsonSchema, url, prompt }: { jsonSchema: Record<string, unknown>; url: string; prompt: string },
      { projectContext, signal },
    ) {
      return projectContext.trpcClient.ai.scrape.mutate({ schema: jsonSchema, url, prompt }, { signal });
    },
    renderRequestTrace({ jsonSchema, url, prompt }) {
      return (
        <>
          <Well title="URL" code="url">
            {url}
          </Well>
          <Well title="Prompt" markdownPreferred>
            {prompt}
          </Well>
          {renderJsonWell("Schema", jsonSchema)}
        </>
      );
    },
    renderResultTrace: (result) => renderJsonWell("AI Scrape Result", result),
  },
  async <T extends unknown>(nrc: NodeRunnerContext, param: { schema: z.ZodSchema<T>; url: string; prompt: string }) => {
    const jsonSchema = zodToJsonSchema(param.schema, "S").definitions?.S as Record<string, unknown>;
    const response = await nrc.runEffect(AIScrapeNEffect, { jsonSchema, url: param.url, prompt: param.prompt });
    return param.schema.parse(response);
  },
);
