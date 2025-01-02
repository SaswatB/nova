import { exec } from "child_process";
import { promisify } from "util";

import { swEffect } from "./swEffect";

const execAsync = promisify(exec);

export const gitEffect = swEffect
  .runnableAnd(
    async ({ command }: { command: string }, { effectContext: { cwd } }) => {
      try {
        const { stdout } = await execAsync(`git ${command}`, { cwd });
        return stdout.trim();
      } catch (error) {
        console.error("Git command failed:", error);
        return "";
      }
    }
  )
  .callAlias((command: string) => ({ command }));
