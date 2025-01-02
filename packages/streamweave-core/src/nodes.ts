import isEqual from "lodash/isEqual";
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

type BuilderParams = {
  Value: Record<string, unknown>;
  Result: Record<string, unknown>;
  EffectMap: SwEffectMap;
  ExtraNodeContext: unknown;
};
type UpdateParams<Current extends BuilderParams, Updates extends Partial<BuilderParams>> = Omit<
  Current,
  keyof Updates
> &
  Updates;
type SwNodeFromParams<P extends BuilderParams> = SwNode<P["Value"], P["Result"], P["EffectMap"], P["ExtraNodeContext"]>;

interface SwNodeBuilder<P extends BuilderParams, AllowedMethods extends keyof SwNodeBuilder<P, any>> {
  context<NewExtraNodeContext>(): PickedSwNodeBuilder<
    UpdateParams<P, { ExtraNodeContext: NewExtraNodeContext }>,
    Exclude<AllowedMethods, "context">
  >;
  effects<NewEffectMap extends SwEffectMap>(
    effectMap: NewEffectMap,
  ): PickedSwNodeBuilder<
    UpdateParams<P, { EffectMap: NewEffectMap }>,
    Exclude<AllowedMethods, "effects"> | "effectMap"
  >;
  effectMap: P["EffectMap"];

  scope(
    scopeFactory: SwScope | ((parentScope: SwScope) => SwScope | null),
  ): PickedSwNodeBuilder<P, Exclude<AllowedMethods, "scope">>;

  input<NewValue extends Record<string, unknown>>(
    schema: SwNodeFromParams<UpdateParams<P, { Value: NewValue }>>["inputSchema"],
  ): PickedSwNodeBuilder<UpdateParams<P, { Value: NewValue }>, Exclude<AllowedMethods, "input">>;
  output<NewResult extends Record<string, unknown>>(
    schema: SwNodeFromParams<UpdateParams<P, { Result: NewResult }>>["outputSchema"],
  ): PickedSwNodeBuilder<UpdateParams<P, { Result: NewResult }>, Exclude<AllowedMethods, "output">>;

  runnable(run: SwNodeFromParams<P>["run"]): SwNodeFromParams<P>;
}

// applies AllowedMethods to the builder
type PickedSwNodeBuilder<P extends BuilderParams, AllowedMethods extends keyof SwNodeBuilder<P, any>> = Pick<
  SwNodeBuilder<P, AllowedMethods>,
  AllowedMethods
>;

export type ExtractSwNodeRunnerContext<T extends Pick<SwNodeBuilder<any, any>, "runnable">> =
  T extends Pick<SwNodeBuilder<infer P, any>, "runnable">
    ? SwNodeRunnerContextType<P["EffectMap"], P["ExtraNodeContext"]>
    : never;

function createSwNodeBuilder<P extends BuilderParams>(values: {
  effectMap: P["EffectMap"];
  scopeFactory?: (parentScope: SwScope) => SwScope | null;
  inputSchema: SwNodeFromParams<P>["inputSchema"];
  outputSchema: SwNodeFromParams<P>["outputSchema"];
}): SwNodeBuilder<P, any> {
  return {
    context: () => createSwNodeBuilder({ ...values }),
    effects: (newEffectMap) => createSwNodeBuilder({ ...values, effectMap: newEffectMap }),
    effectMap: values.effectMap,

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

export const swNodeInit: PickedSwNodeBuilder<
  { Value: {}; Result: {}; EffectMap: {}; ExtraNodeContext: {} },
  Exclude<keyof SwNodeBuilder<any, any>, "effectMap">
> = createSwNodeBuilder({
  effectMap: {},
  inputSchema: z.object({}),
  outputSchema: z.object({}),
});

// #endregion
