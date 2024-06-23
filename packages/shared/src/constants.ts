import { z } from "zod";

export enum IterationMode {
  // AUTO = "auto",
  MODIFY_PLAN = "modifyPlan",
  MODIFY_CHANGE_SET = "modifyChangeSet",
}

export const ProjectSettingsSchema = z
  .object({
    rules: z.array(z.object({ text: z.string() })),
    files: z
      .object({
        blockedPaths: z.array(z.string()),
        extensions: z.array(z.string()),
      })
      .partial(),
  })
  .partial();
export type ProjectSettings = z.infer<typeof ProjectSettingsSchema>;
