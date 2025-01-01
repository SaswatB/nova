import { isEqual } from "lodash";
import { UnknownKeysParam, z, ZodTypeAny } from "zod";

import { SwEffect, SwEffectMap, SwEffectResult } from "./effects";
import { CreateSwNodeRef, ResolveSwNodeRefs } from "./refs";
import { SwScope, SwScopeType } from "./scopes";

export interface SwNode<
  Value extends Record<string, unknown> = any,
  Result extends Record<string, unknown> = any,
  EffectMap extends SwEffectMap = any,
  ExtraNodeContext = any,
> {
  /**
   * ScopeType.Space = global scope
   * null = current scope
   * otherwise create a new child scope
   */
  scopeFactory?: (parentScope: SwScope) => SwScope | null;
  inputSchema: z.ZodObject<{ [K in keyof Value]: z.ZodType<Value[K]> }, UnknownKeysParam, ZodTypeAny, Value, Value>;
  outputSchema: z.ZodObject<
    { [K in keyof Result]: z.ZodType<Result[K]> },
    UnknownKeysParam,
    ZodTypeAny,
    Result,
    Result
  >;
  run: (value: ResolveSwNodeRefs<Value>, nrc: SwNodeRunnerContextType<EffectMap, ExtraNodeContext>) => Promise<Result>;

  effectMap: EffectMap;
}
export type SwNodeValue<T extends SwNode> = T extends SwNode<infer Value, any, any, any> ? Value : never;
export type SwNodeResult<T extends SwNode> = T extends SwNode<any, infer Result, any, any> ? Result : never;
export type SwNodeEffectMap<T extends SwNode> = T extends SwNode<any, any, infer EffectMap, any> ? EffectMap : never;
export type SwNodeExtraContext<T extends SwNode> =
  T extends SwNode<any, any, any, infer ExtraNodeContext> ? ExtraNodeContext : never;

export type SwNodeMap = Record<string, SwNode>;

export type GetEffectContext<NodeMap extends SwNodeMap> =
  NodeMap[keyof NodeMap] extends SwNode<any, any, infer EffectMap, any>
    ? EffectMap[keyof EffectMap] extends SwEffect<any, any, infer ExtraEffectContext, any>
      ? ExtraEffectContext
      : never
    : never;

export type GetEffectMapFromNodeMap<NodeMap extends SwNodeMap> =
  NodeMap[keyof NodeMap] extends SwNode<any, any, infer EffectMap, any> ? EffectMap : never;

export type GetNodeContext<NodeMap extends SwNodeMap> =
  NodeMap[keyof NodeMap] extends SwNode<any, any, any, infer ExtraNodeContext> ? ExtraNodeContext : never;

type MapSwEffectMapToRun<T extends SwEffectMap> = {
  [K in keyof T]: (...param: Parameters<T[K]["callAlias"]>) => Promise<SwEffectResult<T[K]>>;
};

export interface SwNodeRunnerContextType<T extends SwEffectMap = Record<string, never>, ExtraNodeContext = unknown> {
  nodeContext: ExtraNodeContext;
  effects: MapSwEffectMapToRun<T>;

  // dependency management
  getOrAddDependencyForResult: <T extends SwNode>(nodeDef: T, nodeValue: SwNodeValue<T>) => Promise<SwNodeResult<T>>;
  findSwNodeForResult: <T extends SwNode>(
    nodeDef: T,
    filter: (node: SwNodeValue<T>, extra: { scope: SwScope; isCurrentScope: boolean }) => boolean,
  ) => Promise<SwNodeResult<T> | null>;

  // dependant management
  addDependantSwNode: <V extends Record<string, unknown>>(nodeDef: SwNode<V>, nodeValue: V) => void;

  // refs
  createSwNodeRef: CreateSwNodeRef; // create a reference to the current node
}

// #region builder

interface SwNodeBuilder<
  Value extends Record<string, unknown>,
  Result extends Record<string, unknown>,
  EffectMap extends SwEffectMap,
  ExtraNodeContext,
> {
  context<NewExtraNodeContext>(): Pick<
    SwNodeBuilder<Value, Result, EffectMap, NewExtraNodeContext>,
    "effects" | "scope" | "input" | "output" | "runnable"
  >;
  effects<NewEffectMap extends SwEffectMap>(
    effectMap: NewEffectMap,
  ): Pick<SwNodeBuilder<Value, Result, NewEffectMap, ExtraNodeContext>, "scope" | "input" | "output" | "runnable">;

  scope(
    scopeFactory: SwScope | ((parentScope: SwScope) => SwScope | null),
  ): Pick<SwNodeBuilder<Value, Result, EffectMap, ExtraNodeContext>, "input" | "output" | "runnable">;

  input<NewValue extends Record<string, unknown>>(
    schema: SwNode<NewValue, Result, EffectMap, ExtraNodeContext>["inputSchema"],
  ): Pick<SwNodeBuilder<NewValue, Result, EffectMap, ExtraNodeContext>, "output" | "runnable">;
  output<NewResult extends Record<string, unknown>>(
    schema: SwNode<Value, NewResult, EffectMap, ExtraNodeContext>["outputSchema"],
  ): Pick<SwNodeBuilder<Value, NewResult, EffectMap, ExtraNodeContext>, "runnable">;

  runnable(
    run: SwNode<Value, Result, EffectMap, ExtraNodeContext>["run"],
  ): SwNode<Value, Result, EffectMap, ExtraNodeContext>;
}

export type ExtractSwNodeRunnerContext<T extends Pick<SwNodeBuilder<any, any, any, any>, "runnable">> =
  T extends Pick<SwNodeBuilder<any, any, infer EffectMap, infer ExtraNodeContext>, "runnable">
    ? SwNodeRunnerContextType<EffectMap, ExtraNodeContext>
    : never;

function createSwNodeBuilder<
  Value extends Record<string, unknown>,
  Result extends Record<string, unknown>,
  EffectMap extends SwEffectMap,
  ExtraNodeContext,
>(values: {
  effectMap: EffectMap;
  scopeFactory?: (parentScope: SwScope) => SwScope | null;
  inputSchema: SwNode<Value, Result, EffectMap, ExtraNodeContext>["inputSchema"];
  outputSchema: SwNode<Value, Result, EffectMap, ExtraNodeContext>["outputSchema"];
}): SwNodeBuilder<Value, Result, EffectMap, ExtraNodeContext> {
  return {
    context: () => createSwNodeBuilder({ ...values }),
    effects: (newEffectMap) => createSwNodeBuilder({ ...values, effectMap: newEffectMap }),

    /**
     * Defines the scope for the node.
     *
     * If the scopeFactory is a function:
     *  - null = current scope
     *  - SwScopeType.Space = global scope
     *  - otherwise create a new child scope
     * If the scopeFactory is a SwScope:
     *  - SwScopeType.Space = global scope
     *  - otherwise create a new child scope if it's not equal to the current scope
     */
    scope: (scopeFactory) =>
      createSwNodeBuilder({
        ...values,
        scopeFactory:
          typeof scopeFactory === "function"
            ? scopeFactory
            : scopeFactory.type === SwScopeType.Space
              ? () => scopeFactory
              : (currentScope) => (isEqual(currentScope, scopeFactory) ? null : scopeFactory),
      }),

    input: (newInputSchema) => createSwNodeBuilder({ ...values, inputSchema: newInputSchema }),
    output: (newOutputSchema) => createSwNodeBuilder({ ...values, outputSchema: newOutputSchema }),

    runnable: (run) => ({ ...values, run }),
  };
}

export const swNodeInit = createSwNodeBuilder({
  effectMap: {},
  inputSchema: z.object({}),
  outputSchema: z.object({}),
});

// #endregion
