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

export type OmitUnion<T, K extends keyof any> = T extends any ? Omit<T, K> : never;
