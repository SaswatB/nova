import { ToastOptions } from "react-toastify";

import { ProjectSettings } from "@repo/shared";

import { ReadFileResult } from "../files";
import { AppTRPCClient } from "../trpc-client";

export const DEFAULT_RULES = [
  "Prefer concise and expressive code over verbose code, but keep things readable and use comments if necessary.",
  "Do not refactor the codebase unless required for the task.",
  "Do not delete dead code or comments unless it is directly related to the task.",
  "Keep error handling to a minimum unless otherwise explicitly asked for.",
  "Don't worry about unit tests unless they are explicitly asked for.",
  "It's fine to have large complex functions during the initial implementation.",
];
export const DEFAULT_EXTENSIONS = [
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".json",
  ".prisma",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".md",
  ".txt",
  ".yml",
  "README",
  "Dockerfile",
  ".py",
  ".h",
  ".c",
  ".cpp",
  ".java",
  ".go",
  ".rs",
  ".scala",
  ".sql",
  ".bash",
  ".zsh",
  ".sh",
  ".ps1",
  ".bat",
];

export function getEffectiveExtensions(settings: ProjectSettings): string[] {
  return settings.files?.extensions ?? DEFAULT_EXTENSIONS;
}

export interface ProjectContext {
  settings: ProjectSettings;

  trpcClient: AppTRPCClient;
  dryRun: boolean;

  ensureFS: () => Promise<void>;
  readFile: (path: string) => Promise<ReadFileResult>;
  writeFile: (path: string, content: string) => Promise<string>;
  deleteFile: (path: string) => Promise<void>;
  saveJsonWithPicker: (filename: string, json: object) => Promise<void>;

  displayToast: (message: string, options?: ToastOptions) => void;
  showRevertChangesDialog: (
    instances: { id: string; render: () => { title: React.ReactNode; body?: React.ReactNode } }[],
  ) => Promise<string[]>;
  projectCacheGet: <T>(key: string) => Promise<T | undefined>;
  projectCacheSet: (key: string, value: unknown) => Promise<void>;
  globalCacheGet: <T>(key: string) => Promise<T | undefined>;
  globalCacheSet: (key: string, value: unknown) => Promise<void>;
  writeDebugFile: (name: string, content: string) => Promise<void>;
}
