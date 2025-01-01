import { swEffect } from "../swEffect";

export const WriteFileNEffect = swEffect
  .runnableAnd(async ({ path, content }: { path: string; content: string }, { effectContext }) => {
    if (effectContext.dryRun) {
      console.log(`[WriteFileNEffect] (Dry Run) Skipping write operation for: ${path}`);
      return { dryRun: true };
    }

    const fileExisted = (await effectContext.readFile(path)).type !== "not-found";
    const original = await effectContext.writeFile(path, content);
    return { created: !fileExisted, original };
  })
  .callAliasAnd((path: string, content: string) => ({ path, content }))
  .revertable({
    canRevert: (p, r) => !r.dryRun,
    async revert({ path }, { created, original, dryRun }, { effectContext }) {
      if (dryRun) {
        console.log("[WriteFileNEffect] (Dry Run) Skipping revert operation for: ${path}");
        return;
      }

      if (created) {
        console.log("[WriteFileNEffect] Deleting file for revert", path);
        await effectContext.deleteFile(path);
      } else {
        console.log("[WriteFileNEffect] Restoring file for revert", path);
        await effectContext.writeFile(path, original || "");
      }
    },
  });
