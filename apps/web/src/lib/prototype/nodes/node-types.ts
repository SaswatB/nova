import { z } from "zod";

import { AppTRPCClient } from "../../trpc-client";
import { NNodeRef, NNodeRefAccessorSchema, NNodeRefAccessorSchemaMap, orRef } from "./ref-types";

export enum NNodeType {
  Output = "output",

  ProjectAnalysis = "project-analysis",
  RelevantFileAnalysis = "relevant-file-analysis",
  TypescriptDepAnalysis = "typescript-dep-analysis",

  Plan = "plan",
  Execute = "execute",
  CreateChangeSet = "create-change-set",
  ApplyFileChanges = "apply-file-changes",
}

export interface ResearchedFile {
  path: string;
  content: string;
  research: string;
}
export interface ResearchedFileSystem {
  files: ResearchedFile[];
  research: string;
}

export const NNodeValue = z.discriminatedUnion("type", [
  z.object({ type: z.literal(NNodeType.Output), description: z.string(), value: orRef(z.unknown()) }),
  z.object({ type: z.literal(NNodeType.ProjectAnalysis) }),
  z.object({ type: z.literal(NNodeType.RelevantFileAnalysis), goal: orRef(z.string().min(1)) }),
  z.object({ type: z.literal(NNodeType.TypescriptDepAnalysis) }),
  z.object({ type: z.literal(NNodeType.Plan), goal: orRef(z.string()) }),
  z.object({
    type: z.literal(NNodeType.Execute),
    instructions: orRef(z.string()),
    relevantFiles: orRef(z.array(z.string())),
  }),
  z.object({ type: z.literal(NNodeType.CreateChangeSet), rawChangeSet: orRef(z.string()) }),
  z.object({
    type: z.literal(NNodeType.ApplyFileChanges),
    path: orRef(z.string()),
    changes: orRef(z.array(z.string())),
  }),
]);
export type NNodeValue = z.infer<typeof NNodeValue>;
export type NNodeResult =
  | { type: NNodeType.Output }
  | { type: NNodeType.ProjectAnalysis; result: ResearchedFileSystem }
  | { type: NNodeType.RelevantFileAnalysis; result: string; files: string[] }
  | {
      type: NNodeType.TypescriptDepAnalysis;
      result: Record<string, { fileName?: string | undefined; moduleSpecifier: string }[]>;
    }
  | { type: NNodeType.Plan; result: string }
  | { type: NNodeType.Execute; result: string }
  | { type: NNodeType.CreateChangeSet; result: unknown }
  | { type: NNodeType.ApplyFileChanges; result: string };

export interface ProjectContext {
  systemPrompt: string;
  rules: string[];
  extensions: string[];

  folderHandle: FileSystemDirectoryHandle;
  trpcClient: AppTRPCClient;
}

export interface NodeRunnerContext {
  projectContext: ProjectContext;

  addDependantNode: (node: NNodeValue) => void;
  getOrAddDependencyForResult: <T extends NNodeType>(
    nodeValue: NNodeValue & { type: T },
    inheritDependencies?: boolean,
  ) => Promise<
    NNodeResult & { type: T } & {
      createNodeRef: <T extends NNodeRefAccessorSchema>(
        accessor: NNodeRef<T>["accessor"] & { type: "result" },
      ) => NNodeRef<T>; // create a reference to the dependency node
    }
  >;
  createNodeRef: <T extends NNodeRefAccessorSchema>(accessor: NNodeRef<T>["accessor"]) => NNodeRef<T>; // create a reference to the current node
  resolveNodeRef: <T extends NNodeRefAccessorSchema>(
    ref: NNodeRef<T> | NNodeRefAccessorSchemaMap[T],
  ) => NNodeRefAccessorSchemaMap[T];

  readFile: (
    path: string,
  ) => Promise<{ type: "not-found" } | { type: "file"; content: string } | { type: "directory"; files: string[] }>;
  writeFile: (path: string, content: string) => Promise<void>;

  aiChat: (
    model: "groq" | "gpt4o" | "opus" | "gemini" | "geminiFlash",
    messages: { role: "user" | "assistant"; content: string }[],
  ) => Promise<string>;
  aiJson: <T extends object>(schema: z.ZodSchema<T>, input: string) => Promise<T>;
}
