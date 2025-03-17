export interface SwEffectContext<ExtraEffectContext> {
  effectContext: ExtraEffectContext;
  signal: AbortSignal;
}

type EffectRunWrapper = (...args: any[]) => Promise<any>;

export interface SwEffect<
  Param = unknown,
  Result = any,
  ExtraEffectContext = unknown,
  Wrapper extends EffectRunWrapper = EffectRunWrapper,
> {
  cacheable?: boolean;
  revertable?: boolean;

  generateCacheKey?(param: Param): string | object | null; // null to disable cache

  canRevert?(param: Param, result: Result, context: SwEffectContext<ExtraEffectContext>): boolean;
  revert?(param: Param, result: Result, context: SwEffectContext<ExtraEffectContext>): Promise<void>;

  run(param: Param, context: SwEffectContext<ExtraEffectContext>): Promise<Result>;

  wrap: (runEffect: (param: Param) => Promise<Result>) => Wrapper;
}

export type SwEffectParam<Effect extends SwEffect> = Effect extends SwEffect<infer Param, any, any> ? Param : never;
export type SwEffectResult<Effect extends SwEffect> = Effect extends SwEffect<any, infer Result, any> ? Result : never;
export type SwEffectExtraContext<Effect extends SwEffect> =
  Effect extends SwEffect<any, any, infer ExtraEffectContext> ? ExtraEffectContext : never;
export type SwEffectWrapper<Effect extends SwEffect> =
  Effect extends SwEffect<any, any, any, infer Wrapper> ? Wrapper : never;

export type SwEffectMap = Record<string, SwEffect>;

// #region builder

type BuilderParams = {
  Param: unknown;
  Result: unknown;
  ExtraEffectContext: unknown;
  Wrapper: EffectRunWrapper;
};
type UpdateParams<Current extends BuilderParams, Updates extends Partial<BuilderParams>> = Omit<
  Current,
  keyof Updates
> &
  Updates;
type SwEffectFromParams<P extends BuilderParams> = SwEffect<
  P["Param"],
  P["Result"],
  P["ExtraEffectContext"],
  P["Wrapper"]
>;

type DefaultRunWrapper<Param, Result> = (param: Param) => Promise<Result>;

interface SwEffectBuilder<P extends BuilderParams, AllowedMethods extends keyof SwEffectBuilder<P, any>> {
  context<NewExtraContext>(): PickedSwEffectBuilder<
    UpdateParams<P, { ExtraEffectContext: NewExtraContext }>,
    Exclude<AllowedMethods, "context">
  >;

  runnable<NewParam, NewResult>(
    fn: SwEffectFromParams<
      UpdateParams<P, { Param: NewParam; Result: NewResult; Wrapper: DefaultRunWrapper<NewParam, NewResult> }>
    >["run"],
  ): SwEffectFromParams<
    UpdateParams<P, { Param: NewParam; Result: NewResult; Wrapper: DefaultRunWrapper<NewParam, NewResult> }>
  >;
  runnableAnd<NewParam, NewResult>(
    fn: SwEffectFromParams<
      UpdateParams<P, { Param: NewParam; Result: NewResult; Wrapper: DefaultRunWrapper<NewParam, NewResult> }>
    >["run"],
  ): PickedSwEffectBuilder<
    UpdateParams<P, { Param: NewParam; Result: NewResult; Wrapper: DefaultRunWrapper<NewParam, NewResult> }>,
    | Exclude<AllowedMethods, "context" | "runnable" | "runnableAnd">
    | "wrap"
    | "wrapAnd"
    | "callAlias"
    | "callAliasAnd"
    | "cacheable"
    | "revertable"
  >;

  // wrap and callAlias cannot be used together
  wrap<NewWrapper extends EffectRunWrapper>(
    wrapper: (runEffect: (param: P["Param"]) => Promise<P["Result"]>) => NewWrapper,
  ): SwEffectFromParams<UpdateParams<P, { Wrapper: NewWrapper }>>;
  wrapAnd<NewWrapper extends EffectRunWrapper>(
    wrapper: (runEffect: (param: P["Param"]) => Promise<P["Result"]>) => NewWrapper,
  ): PickedSwEffectBuilder<
    UpdateParams<P, { Wrapper: NewWrapper }>,
    Exclude<AllowedMethods, "wrap" | "wrapAnd" | "callAlias" | "callAliasAnd">
  >;

  callAlias<NewWrapperParams extends any[]>(
    alias: (...params: NewWrapperParams) => P["Param"],
  ): SwEffectFromParams<UpdateParams<P, { Wrapper: (...param: NewWrapperParams) => Promise<P["Result"]> }>>;
  callAliasAnd<NewWrapperParams extends any[]>(
    alias: (...params: NewWrapperParams) => P["Param"],
  ): PickedSwEffectBuilder<
    UpdateParams<P, { Wrapper: (...param: NewWrapperParams) => Promise<P["Result"]> }>,
    Exclude<AllowedMethods, "wrap" | "wrapAnd" | "callAlias" | "callAliasAnd">
  >;

  // cacheable and revertable cannot be used together
  cacheable(o2?: Pick<SwEffectFromParams<P>, "generateCacheKey">): SwEffectFromParams<P>;
  revertable(
    o2: Pick<SwEffectFromParams<P>, "canRevert"> | Required<Pick<SwEffectFromParams<P>, "revert">>,
  ): SwEffectFromParams<P>;
}

// applies AllowedMethods to the builder
type PickedSwEffectBuilder<P extends BuilderParams, AllowedMethods extends keyof SwEffectBuilder<P, any>> = Pick<
  SwEffectBuilder<P, AllowedMethods>,
  AllowedMethods
>;

function createSwEffectBuilder<P extends BuilderParams>(
  o: Pick<SwEffectFromParams<P>, "run" | "wrap">,
): SwEffectBuilder<P, any> {
  return {
    context: () => createSwEffectBuilder({ ...o, run: async (p) => p }),

    runnable: (run) => ({ run, wrap: (wrapRun) => (p) => wrapRun(p) }),
    runnableAnd: (run) => createSwEffectBuilder({ run, wrap: (wrapRun) => (p) => wrapRun(p) }),

    wrap: (wrap) => ({ ...o, wrap }),
    wrapAnd: (wrap) => createSwEffectBuilder({ ...o, wrap }),

    callAlias: (alias) => ({
      ...o,
      wrap:
        (wrapRun) =>
        (...params: Parameters<typeof alias>) =>
          wrapRun(alias(...params)),
    }),
    callAliasAnd: (alias) =>
      createSwEffectBuilder({
        ...o,
        wrap:
          (wrapRun) =>
          (...params: Parameters<typeof alias>) =>
            wrapRun(alias(...params)),
      }),

    cacheable: (o2) => ({ ...o, ...o2, cacheable: true }),
    revertable: (o2) => ({ ...o, ...o2, revertable: true }),
  };
}

export const swEffectInit: PickedSwEffectBuilder<
  { Param: unknown; Result: unknown; ExtraEffectContext: {}; Wrapper: DefaultRunWrapper<unknown, unknown> },
  "context" | "runnable" | "runnableAnd"
> = createSwEffectBuilder({ run: async (p) => p, wrap: (wrapRun) => (p) => wrapRun(p) });

// #endregion
