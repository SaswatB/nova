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

  canRevert?(
    param: Param,
    result: Result,
    context: SwEffectContext<ExtraEffectContext>
  ): boolean;
  revert?(
    param: Param,
    result: Result,
    context: SwEffectContext<ExtraEffectContext>
  ): Promise<void>;

  run(
    param: Param,
    context: SwEffectContext<ExtraEffectContext>
  ): Promise<Result>;

  callAlias: CallAlias;
}

export type SwEffectParam<Effect extends SwEffect> =
  Effect extends SwEffect<infer Param, any, any> ? Param : never;
export type SwEffectResult<Effect extends SwEffect> =
  Effect extends SwEffect<any, infer Result, any> ? Result : never;
export type SwEffectExtraContext<Effect extends SwEffect> =
  Effect extends SwEffect<any, any, infer ExtraEffectContext>
    ? ExtraEffectContext
    : never;

export type SwEffectMap = Record<string, SwEffect>;

// #region builder

interface SwEffectBuilder<
  Param,
  Result,
  ExtraEffectContext,
  CallAlias extends (...args: any[]) => Param,
> {
  context<NewExtraContext>(): Pick<
    SwEffectBuilder<Param, Result, NewExtraContext, CallAlias>,
    "runnable" | "runnableAnd"
  >;

  runnable<NewParam, NewResult>(
    fn: SwEffect<NewParam, NewResult, ExtraEffectContext>["run"]
  ): SwEffect<
    NewParam,
    NewResult,
    ExtraEffectContext,
    (arg: NewParam) => NewParam
  >;
  runnableAnd<NewParam, NewResult>(
    fn: SwEffect<NewParam, NewResult, ExtraEffectContext>["run"]
  ): Pick<
    SwEffectBuilder<
      NewParam,
      NewResult,
      ExtraEffectContext,
      (arg: NewParam) => NewParam
    >,
    "callAlias" | "callAliasAnd" | "cacheable" | "revertable"
  >;

  callAlias<NewCallAlias extends (...args: any[]) => Param>(
    alias: NewCallAlias
  ): SwEffect<Param, Result, ExtraEffectContext, NewCallAlias>;
  callAliasAnd<NewCallAlias extends (...args: any[]) => Param>(
    alias: NewCallAlias
  ): Pick<
    SwEffectBuilder<Param, Result, ExtraEffectContext, NewCallAlias>,
    "cacheable" | "revertable"
  >;

  // cacheable and revertable cannot be used together
  cacheable(
    o2?: Pick<
      SwEffect<Param, Result, ExtraEffectContext, CallAlias>,
      "generateCacheKey"
    >
  ): SwEffect<Param, Result, ExtraEffectContext, CallAlias>;
  revertable(
    o2:
      | Pick<
          SwEffect<Param, Result, ExtraEffectContext, CallAlias>,
          "canRevert"
        >
      | Required<
          Pick<SwEffect<Param, Result, ExtraEffectContext, CallAlias>, "revert">
        >
  ): SwEffect<Param, Result, ExtraEffectContext, CallAlias>;
}

function createSwEffectBuilder<
  Param,
  Result,
  ExtraEffectContext,
  CallAlias extends (...args: any[]) => Param,
>(
  o: Pick<
    SwEffect<Param, Result, ExtraEffectContext, CallAlias>,
    "run" | "callAlias"
  >
): SwEffectBuilder<Param, Result, ExtraEffectContext, CallAlias> {
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

export const swEffectInit: Pick<
  SwEffectBuilder<unknown, unknown, undefined, (arg: unknown) => unknown>,
  "context" | "runnable" | "runnableAnd"
> = createSwEffectBuilder({ run: async (p) => p, callAlias: (p) => p });

// #endregion
