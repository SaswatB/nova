export interface SwEffectContext<ExtraEffectContext> {
  effectContext: ExtraEffectContext;
  signal: AbortSignal;
}

export interface SwEffect<
  Param = unknown,
  Result = unknown,
  ExtraEffectContext = unknown,
  CallAlias extends (...args: any[]) => Param = (...args: any[]) => Param,
> {
  cacheable?: boolean;
  revertable?: boolean;

  generateCacheKey?(param: Param): string | object | null; // null to disable cache

  canRevert?(param: Param, result: Result, context: SwEffectContext<ExtraEffectContext>): boolean;
  revert?(param: Param, result: Result, context: SwEffectContext<ExtraEffectContext>): Promise<void>;

  run(param: Param, context: SwEffectContext<ExtraEffectContext>): Promise<Result>;

  callAlias: CallAlias;
}

export type SwEffectParam<Effect extends SwEffect> = Effect extends SwEffect<infer Param, any, any> ? Param : never;
export type SwEffectResult<Effect extends SwEffect> = Effect extends SwEffect<any, infer Result, any> ? Result : never;
export type SwEffectExtraContext<Effect extends SwEffect> =
  Effect extends SwEffect<any, any, infer ExtraEffectContext> ? ExtraEffectContext : never;

export type SwEffectMap = Record<string, SwEffect>;

// #region builder

type BuilderParams = {
  Param: unknown;
  Result: unknown;
  ExtraEffectContext: unknown;
};
type UpdateParams<Current extends BuilderParams, Updates extends Partial<BuilderParams>> = Omit<
  Current,
  keyof Updates
> &
  Updates;
type SwEffectFromParams<P extends BuilderParams, CallAlias extends (...args: any[]) => P["Param"]> = SwEffect<
  P["Param"],
  P["Result"],
  P["ExtraEffectContext"],
  CallAlias
>;

interface SwEffectBuilder<
  P extends BuilderParams,
  CallAlias extends (...args: any[]) => P["Param"],
  AllowedMethods extends keyof SwEffectBuilder<P, CallAlias, any>,
> {
  context<NewExtraContext>(): PickedSwEffectBuilder<
    UpdateParams<P, { ExtraEffectContext: NewExtraContext }>,
    CallAlias,
    Exclude<AllowedMethods, "context">
  >;

  runnable<NewParam, NewResult>(
    fn: SwEffectFromParams<UpdateParams<P, { Param: NewParam; Result: NewResult }>, (arg: NewParam) => NewParam>["run"],
  ): SwEffectFromParams<UpdateParams<P, { Param: NewParam; Result: NewResult }>, (arg: NewParam) => NewParam>;
  runnableAnd<NewParam, NewResult>(
    fn: SwEffectFromParams<UpdateParams<P, { Param: NewParam; Result: NewResult }>, (arg: NewParam) => NewParam>["run"],
  ): PickedSwEffectBuilder<
    UpdateParams<P, { Param: NewParam; Result: NewResult }>,
    (arg: NewParam) => NewParam,
    | Exclude<AllowedMethods, "context" | "runnable" | "runnableAnd">
    | "callAlias"
    | "callAliasAnd"
    | "cacheable"
    | "revertable"
  >;

  callAlias<NewCallAlias extends (...args: any[]) => P["Param"]>(
    alias: NewCallAlias,
  ): SwEffectFromParams<P, NewCallAlias>;
  callAliasAnd<NewCallAlias extends (...args: any[]) => P["Param"]>(
    alias: NewCallAlias,
  ): PickedSwEffectBuilder<P, NewCallAlias, Exclude<AllowedMethods, "callAlias" | "callAliasAnd">>;

  // cacheable and revertable cannot be used together
  cacheable(o2?: Pick<SwEffectFromParams<P, CallAlias>, "generateCacheKey">): SwEffectFromParams<P, CallAlias>;
  revertable(
    o2:
      | Pick<SwEffectFromParams<P, CallAlias>, "canRevert">
      | Required<Pick<SwEffectFromParams<P, CallAlias>, "revert">>,
  ): SwEffectFromParams<P, CallAlias>;
}

// applies AllowedMethods to the builder
type PickedSwEffectBuilder<
  P extends BuilderParams,
  CallAlias extends (...args: any[]) => P["Param"],
  AllowedMethods extends keyof SwEffectBuilder<P, CallAlias, any>,
> = Pick<SwEffectBuilder<P, CallAlias, AllowedMethods>, AllowedMethods>;

function createSwEffectBuilder<P extends BuilderParams, CallAlias extends (...args: any[]) => P["Param"]>(
  o: Pick<SwEffectFromParams<P, CallAlias>, "run" | "callAlias">,
): SwEffectBuilder<P, CallAlias, any> {
  return {
    context: () => createSwEffectBuilder({ ...o, run: async (p) => p }),

    runnable: (run) => ({ run, callAlias: (p) => p }),
    runnableAnd: (run) => createSwEffectBuilder({ run, callAlias: (p) => p }),

    callAlias: (alias) => ({ ...o, callAlias: alias }),
    callAliasAnd: (alias) => createSwEffectBuilder({ ...o, callAlias: alias }),

    cacheable: (o2) => ({ ...o, ...o2, cacheable: true }),
    revertable: (o2) => ({ ...o, ...o2, revertable: true }),
  };
}

export const swEffectInit: PickedSwEffectBuilder<
  { Param: unknown; Result: unknown; ExtraEffectContext: {} },
  (arg: unknown) => unknown,
  "context" | "runnable" | "runnableAnd"
> = createSwEffectBuilder({ run: async (p) => p, callAlias: (p) => p });

// #endregion
