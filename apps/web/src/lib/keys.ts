import { z } from "zod";

import { ProjectSettingsSchema } from "@repo/shared";

export const lsKey = {
  dryRun: { key: "dryRun", schema: z.boolean() },
  onboardingDialogShown: { key: "onboardingDialogShown", schema: z.boolean() },
  projects: { key: "projects", schema: z.array(z.object({ id: z.string(), name: z.string() })) },
  projectSettings: (projectId: string) => ({
    key: `project:${projectId}:settings`,
    schema: ProjectSettingsSchema,
  }),
  projectSpaces: (projectId: string) => ({
    key: `spaces:${projectId}`, // todo make this consistent?
    schema: z.array(z.object({ id: z.string(), name: z.string().nullable(), timestamp: z.number() })),
  }),
  spaceSizes: { key: "space:sizes", schema: z.array(z.number()) },
  spaceLastPage: (spaceId: string) => ({ key: `space:${spaceId}:lastPage`, schema: z.string().nullable() }),
  workspaceSizes: { key: "workspace:sizes", schema: z.array(z.number()) },
};

export const idbKey = {
  projectRoot: (projectId: string) => `project:${projectId}:root`,
  projectCache: (projectId: string, key: string) => `project-${projectId}:graph-cache:${key}`, // todo make this consistent?
  spacePages: (spaceId: string) => `space:${spaceId}:pages`,
};
