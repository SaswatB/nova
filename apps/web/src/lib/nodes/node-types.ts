import { UnknownKeysParam, z, ZodTypeAny } from "zod";

import { ProjectSettings } from "@repo/shared";

import { RunNodeEffect } from "./effect-types";
import { CreateNodeRef, ResolveRefs } from "./ref-types";

export enum NodeScopeType {
  Space, // top level, only one in a graph
  Task,
}
export type NodeScopeDef =
  | { type: NodeScopeType.Space }
  | { type: NodeScopeType.Task; value: "code-change" | "web-research" };
export const NSDef = {
  space: { type: NodeScopeType.Space },
  codeChange: { type: NodeScopeType.Task, value: "code-change" },
  webResearch: { type: NodeScopeType.Task, value: "web-research" },
} satisfies Record<string, NodeScopeDef>;

export interface NNodeDef<
  TypeId extends string = string,
  Value extends Record<string, unknown> = any,
  Result extends Record<string, unknown> = any,
> {
  typeId: TypeId;
  scopeDef?: NodeScopeDef;
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
  options: TypeId | { typeId: TypeId; scopeDef?: NodeScopeDef },
  valueSchema: NNodeDef<TypeId, Value, Result>["valueSchema"],
  resultSchema: NNodeDef<TypeId, Value, Result>["resultSchema"],
  funcs: {
    run: NNodeDef<TypeId, Value, Result>["run"];
    // extends is used to push ts to prefer inference from the schemas
    renderInputs: Value extends Record<string, unknown> ? NNodeDef<TypeId, Value, Result>["renderInputs"] : never;
    renderResult: Result extends Record<string, unknown> ? NNodeDef<TypeId, Value, Result>["renderResult"] : never;
  },
): NNodeDef<TypeId, Value, Result> {
  const o = typeof options === "string" ? { typeId: options } : options;
  return { ...o, valueSchema, resultSchema, ...funcs };
}

export interface NodeRunnerContext {
  settings: ProjectSettings;

  getOrAddDependencyForResult: <T extends NNodeDef>(nodeDef: T, nodeValue: NNodeValue<T>) => Promise<NNodeResult<T>>;
  findNodeForResult: <T extends NNodeDef>(
    nodeDef: T,
    filter: (node: NNodeValue<T>, extra: { scopeDef: NodeScopeDef; isCurrentScope: boolean }) => boolean,
  ) => Promise<NNodeResult<T> | null>;
  addDependantNode: <V extends {}>(nodeDef: NNodeDef<string, V>, nodeValue: V) => void;
  createNodeRef: CreateNodeRef; // create a reference to the current node

  e$: RunNodeEffect; // shorthand for runEffect
  runEffect: RunNodeEffect;
}
