import { swEffect } from "../swEffect";

export const SetCacheNEffect = swEffect
  .runnableAnd(async ({ key, value }: { key: string; value: unknown }, { effectContext }) => {
    await effectContext.projectCacheSet(key, value);
  })
  .callAlias((key, value) => ({ key, value }));

// renderRequestTrace: ({ key, value }) => renderJsonWell(`Set Cache ${key}`, value),
// renderResultTrace: () => renderJsonWell("Cache Set", "Cache value set successfully"),
