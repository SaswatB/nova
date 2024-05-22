import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "fs";
import { Draft, produce } from "immer";
import { basename, dirname, extname, join } from "path";
import { z } from "zod";

const CACHE_DIR = join(__dirname, "cache");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

export function getDb<T extends object>(filename: string = "db.json", schema: z.ZodSchema<T>, defaultState: T) {
  const flush = (s: T, saveFilename = filename) => {
    console.log("flushing", s, saveFilename, JSON.stringify(s, null, 2));
    writeFileSync(saveFilename, JSON.stringify(s, null, 2));
  };

  let state: T;
  try {
    state = schema.parse(JSON.parse(readFileSync(filename, "utf-8")));
  } catch (e) {
    state = defaultState;
  }
  // flush(state, filename.replace(".json", `-${Date.now()}.json`));
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === "update")
          return (callback: (s: Draft<T>) => void) => {
            const newState = produce(state, callback);
            state = newState;
            flush(newState, filename);
          };
        return (state as any)[prop];
      },
    },
  ) as T & { update: (callback: (s: Draft<T>) => void) => void };
}

export function readFilesRecursively(dir: string): { path: string; content: string }[] {
  let files: { path: string; content: string }[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);

    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files = files.concat(readFilesRecursively(fullPath));
    } else {
      files.push({ path: fullPath, content: readFileSync(fullPath, "utf-8") });
    }
  }

  return files;
}

export function removeKey(obj: object, keyName: string): object {
  if (Array.isArray(obj)) {
    return obj.map((item) => removeKey(item, keyName));
  } else if (obj !== null && typeof obj === "object") {
    const newObj = {};
    for (const key in obj) {
      if (key !== keyName) {
        (newObj as any)[key] = removeKey((obj as any)[key], keyName);
      }
    }
    return newObj;
  }
  return obj;
}

export function archiveDebugJsonFiles(inputDirectory: string) {
  const files = readdirSync(inputDirectory);
  const jsonFiles = files.filter((file) => extname(file) === ".json" && !basename(file).match(/\d+\.json$/));

  jsonFiles.forEach((file) => {
    let newFileName;
    let counter = 1;
    const baseName = basename(file, ".json");

    do {
      newFileName = join(inputDirectory, "archive", `${baseName}${counter}.json`);
      counter++;
    } while (existsSync(newFileName));

    renameSync(join(inputDirectory, file), newFileName);
  });
}
