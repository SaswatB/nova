import { ToastOptions } from "react-toastify";
import { UnknownKeysParam, z, ZodTypeAny } from "zod";

import { ProjectSettings } from "@repo/shared";

import { ReadFileResult } from "../files";
import { RouterInput, RouterOutput } from "../trpc-client";
import { CreateNodeRef, ResolveRefs } from "./ref-types";

export interface NNodeDef<
  TypeId extends string = string,
  Value extends Record<string, unknown> = any,
  Result extends Record<string, unknown> = any,
> {
  typeId: TypeId;
  valueSchema: z.ZodObject<{ [K in keyof Value]: z.ZodType<Value[K]> }, UnknownKeysParam, ZodTypeAny, Value, Value>;
  resultSchema: z.ZodObject<
    { [K in keyof Result]: z.ZodType<Result[K]> },
    UnknownKeysParam,
    ZodTypeAny,
    Result,
    Result
  >;
  run: (value: ResolveRefs<Value>, nrc: NodeRunnerContext) => Promise<Result>;
  renderInputs: (value: ResolveRefs<Value>) => React.ReactNode;
  renderResult: (result: Result, value: ResolveRefs<Value>) => React.ReactNode;
}
export type NNodeValue<T extends NNodeDef> = T extends NNodeDef<string, infer Value, any> ? Value : never;
export type NNodeResult<T extends NNodeDef> = T extends NNodeDef<string, any, infer Result> ? Result : never;

export function createNodeDef<
  TypeId extends string,
  Value extends Record<string, unknown>,
  Result extends Record<string, unknown>,
>(
  typeId: TypeId,
  valueSchema: NNodeDef<TypeId, Value, Result>["valueSchema"],
  resultSchema: NNodeDef<TypeId, Value, Result>["resultSchema"],
  funcs: {
    run: NNodeDef<TypeId, Value, Result>["run"];
    // extends is used to push ts to prefer inference from the schemas
    renderInputs: Value extends Record<string, unknown> ? NNodeDef<TypeId, Value, Result>["renderInputs"] : never;
    renderResult: Result extends Record<string, unknown> ? NNodeDef<TypeId, Value, Result>["renderResult"] : never;
  },
): NNodeDef<TypeId, Value, Result> {
  return { typeId, valueSchema, resultSchema, ...funcs };
}

export interface NodeRunnerContext {
  settings: ProjectSettings;

  addDependantNode: <V extends {}>(nodeDef: NNodeDef<string, V>, nodeValue: V) => void;
  getOrAddDependencyForResult: <T extends NNodeDef>(
    nodeDef: T,
    nodeValue: NNodeValue<T>,
    inheritDependencies?: boolean,
  ) => Promise<NNodeResult<T> & { createNodeRef: CreateNodeRef /* create a reference to the dependency node */ }>;
  findNodeForResult: <T extends NNodeDef>(
    nodeDef: T,
    filter: (node: NNodeValue<T>) => boolean,
  ) => Promise<NNodeResult<T> | null>;
  createNodeRef: CreateNodeRef; // create a reference to the current node

  readFile: (path: string) => Promise<ReadFileResult>;
  writeFile: (path: string, content: string) => Promise<void>;

  getCache: <T extends z.ZodSchema>(key: string, schema: T) => Promise<z.infer<T> | undefined>;
  setCache: (key: string, value: unknown) => Promise<void>;

  aiChat: (
    model: RouterInput["ai"]["chat"]["model"],
    messages: RouterInput["ai"]["chat"]["messages"],
  ) => Promise<string>;
  aiJson: <T extends object>(schema: z.ZodSchema<T>, data: string, prompt?: string) => Promise<T>;
  aiScrape: <T extends object>(schema: z.ZodSchema<T>, url: string, prompt: string) => Promise<T>;
  aiWebSearch: (query: string) => Promise<RouterOutput["ai"]["webSearch"]>;

  displayToast: (message: string, options?: ToastOptions) => void;
  writeDebugFile: (name: string, content: string) => void;
}
