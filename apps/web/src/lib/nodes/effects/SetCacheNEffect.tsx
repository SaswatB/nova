import { renderJsonWell } from "../../../components/base/Well";
import { createNodeEffect } from "../effect-types";
import { NodeRunnerContext } from "../node-types";

export const SetCacheNEffect = createNodeEffect(
  "set-cache",
  {
    async run({ key, value }: { key: string; value: unknown }, { projectContext }) {
      await projectContext.projectCacheSet(key, value);
    },
    renderRequestTrace: ({ key, value }) => renderJsonWell(`Set Cache ${key}`, value),
    renderResultTrace: () => renderJsonWell("Cache Set", "Cache value set successfully"),
  },
  (nrc: NodeRunnerContext, key: string, value: unknown) => nrc.e$(SetCacheNEffect, { key, value }),
);
