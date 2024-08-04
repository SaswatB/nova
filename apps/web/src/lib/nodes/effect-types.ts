import type { NodeRunnerContext } from "./node-types";
import { ProjectContext } from "./project-ctx";

export interface NodeEffectContext {
  projectContext: ProjectContext;
  signal: AbortSignal;
}

export interface NodeEffect<TypeId extends string = string, Param = unknown, Result = unknown> {
  typeId: TypeId;

  cacheable?: boolean;
  generateCacheKey?(param: Param): string | object | null; // null to disable cache

  canRevert?(param: Param, result: Result, context: NodeEffectContext): boolean;
  revert?(param: Param, result: Result, context: NodeEffectContext): Promise<void>;
  renderRevertPreview?(
    param: Param,
    result: Result,
    context: NodeEffectContext,
  ): { title: React.ReactNode; body?: React.ReactNode };

  run(param: Param, context: NodeEffectContext): Promise<Result>;

  renderRequestTrace?(param: Param): React.ReactNode;
  renderResultTrace?(result: Result, param?: Param): React.ReactNode;
}

export type NodeEffectParam<Effect extends NodeEffect> = Effect extends NodeEffect<any, infer P, any> ? P : never;

type CreateNodeEffectOptions = "typeId" | "cacheable";
type CreateNodeEffectFuncs =
  | "generateCacheKey"
  | "run"
  | "canRevert"
  | "revert"
  | "renderRevertPreview"
  | "renderRequestTrace"
  | "renderResultTrace";

export function createNodeEffect<TypeId extends string, P, R>(
  options: TypeId | Pick<NodeEffect<TypeId, P, R>, CreateNodeEffectOptions>,
  funcs: Pick<NodeEffect<TypeId, P, R>, CreateNodeEffectFuncs>,
): NodeEffect<TypeId, P, R> & ((nrc: NodeRunnerContext, param: P) => Promise<R>);
export function createNodeEffect<TypeId extends string, P, R, Call extends Function>(
  options: TypeId | Pick<NodeEffect<TypeId, P, R>, CreateNodeEffectOptions>,
  funcs: Pick<NodeEffect<TypeId, P, R>, CreateNodeEffectFuncs>,
  call: Call, // fully customizable shorthand call
): NodeEffect<TypeId, P, R> & Call;
export function createNodeEffect<TypeId extends string, P, R, Call extends Function>(
  options: TypeId | Pick<NodeEffect<TypeId, P, R>, CreateNodeEffectOptions>,
  funcs: Pick<NodeEffect<TypeId, P, R>, CreateNodeEffectFuncs>,
  call?: Call,
): NodeEffect<TypeId, P, R> & Call {
  const o = typeof options === "string" ? { typeId: options } : options;
  if (o.cacheable && funcs.canRevert) throw new Error("cacheable and canRevert cannot both be true");
  if (funcs.canRevert && !funcs.revert) throw new Error("revert function is required when canRevert is set");

  const effectDef: NodeEffect<TypeId, P, R> = { ...o, ...funcs };
  const base = (call || ((nrc: NodeRunnerContext, param: P) => nrc.e$(effectDef, param))) as Call;
  return Object.assign(base, effectDef);
}

export type RunNodeEffect = <TypeId extends string, P, R>(effect: NodeEffect<TypeId, P, R>, param: P) => Promise<R>;
