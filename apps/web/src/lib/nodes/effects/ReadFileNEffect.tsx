import { swEffect } from "../swEffect";

export const ReadFileNEffect = swEffect.runnable(async (path: string, { effectContext }) => {
  if (effectContext.settings.files?.blockedPaths?.some((bp) => path.startsWith(bp))) {
    console.log("[ReadFileNEffect] Blocking read operation for:", path);
    return { type: "not-found" as const };
  }

  const result = await effectContext.readFile(path);
  return result;
});
