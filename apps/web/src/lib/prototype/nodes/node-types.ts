import { z } from "zod";

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
  z.object({ type: z.literal(NNodeType.Output), description: z.string(), value: z.unknown() }),
  z.object({ type: z.literal(NNodeType.ProjectAnalysis) }),
  z.object({ type: z.literal(NNodeType.RelevantFileAnalysis), goal: z.string().min(1) }),
  z.object({ type: z.literal(NNodeType.TypescriptDepAnalysis) }),
  z.object({ type: z.literal(NNodeType.Plan), goal: z.string() }),
  z.object({ type: z.literal(NNodeType.Execute), instructions: z.string(), relevantFiles: z.array(z.string()) }),
  z.object({ type: z.literal(NNodeType.CreateChangeSet), rawChangeSet: z.string() }),
  z.object({ type: z.literal(NNodeType.ApplyFileChanges), path: z.string(), changes: z.array(z.string()) }),
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
  folderHandle: FileSystemDirectoryHandle;
  extensions: string[];
}

export interface NodeRunnerContext {
  projectContext: ProjectContext;

  addDependantNode: (node: NNodeValue) => void;
  getOrAddDependencyForResult: <T extends NNodeType>(
    nodeValue: NNodeValue & { type: T },
    inheritDependencies?: boolean,
  ) => Promise<NNodeResult & { type: T }>;

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
