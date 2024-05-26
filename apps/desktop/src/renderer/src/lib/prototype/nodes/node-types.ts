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

export type NNodeValue =
  | { type: NNodeType.Output; description: string; value: unknown }
  | { type: NNodeType.ProjectAnalysis }
  | { type: NNodeType.RelevantFileAnalysis; goal: string }
  | { type: NNodeType.TypescriptDepAnalysis }
  | { type: NNodeType.Plan; goal: string }
  | { type: NNodeType.Execute; instructions: string; relevantFiles: string[] }
  | { type: NNodeType.CreateChangeSet; rawChangeSet: string }
  | { type: NNodeType.ApplyFileChanges; path: string; changes: string[] };
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
  files: { projectAnchorFiles: string[] };
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
