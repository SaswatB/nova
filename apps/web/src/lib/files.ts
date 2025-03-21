import ignore, { Ignore } from "ignore";
import pLimit from "p-limit";

export type ReadFileResult =
  | { type: "not-found" }
  | { type: "file"; content: string }
  | { type: "directory"; files: { type: "file" | "directory"; name: string }[] };

function checkIgnores(ignores: { dir: string; ignore: Ignore }[], path: string) {
  for (const { dir, ignore } of ignores) {
    if (path.startsWith(dir)) {
      const relativePath = path.slice(dir.length);
      if (ignore.ignores(relativePath)) return true;
    } else {
      console.error("Path does not start with dir", path, dir);
    }
  }
  return false;
}

export async function readFilesRecursively(
  readFile: (path: string) => Promise<ReadFileResult>,
  path: string, // ends with /
  extensions: string[],
  ignores: { dir: string; ignore: Ignore }[] = [],
  maxDepth = 100,
): Promise<({ type: "file"; path: string; content: string } | { type: "directory"; path: string })[]> {
  if (checkIgnores(ignores, path) || maxDepth === 0) return [];

  const limit = pLimit(500);

  const file = await readFile(path);
  // file is unexpected here, since directories are supposed to be provided to this function
  if (file.type === "not-found" || file.type === "file") return [];

  const newIgnores = [...ignores];
  await Promise.all(
    [".gitignore", ".novaignore"].map(async (ignoreFileName) => {
      const ignoreFile = await readFile(`${path}${ignoreFileName}`);
      if (ignoreFile.type === "file") {
        newIgnores.push({ dir: path, ignore: ignore().add(ignoreFile.content) });
      }
    }),
  );

  const result: ({ type: "file"; path: string; content: string } | { type: "directory"; path: string })[] = [];
  result.push({ type: "directory", path });

  // Collect all file reading promises, but limit concurrency
  const filePromises = file.files.map((f) =>
    limit(async () => {
      if (f.name === ".git") return;

      const p = `${path}${f.name}`;
      if (checkIgnores(newIgnores, p)) return;
      if (f.type === "file") {
        if (extensions.some((ext) => p.endsWith(ext))) {
          const file = await readFile(p);
          if (file.type === "file" && file.content.length < 1e6) {
            result.push({ type: "file", path: p, content: file.content });
          }
        }
      } else {
        result.push(...(await readFilesRecursively(readFile, `${p}/`, extensions, newIgnores, maxDepth - 1)));
      }
    }),
  );
  await Promise.all(filePromises);

  return result;
}

export async function saveJsonToFile(filename: string, json: object): Promise<void> {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: filename,
      types: [{ description: "JSON File", accept: { "application/json": [".json"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(json, null, 2));
    await writable.close();
  } catch (error) {
    console.error("Error saving file:", error);
    throw new Error("Failed to save file");
  }
}
