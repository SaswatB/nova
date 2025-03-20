import { EventEmitter } from "events";
import { produce } from "immer";
import cloneDeep from "lodash/cloneDeep";
import get from "lodash/get";
import isEqual from "lodash/isEqual";
import isFunction from "lodash/isFunction";
import uniq from "lodash/uniq";

import { formatError, throwError } from "./err";
import { generateCacheKey } from "./hash";
import { newId } from "./uid";
import { createLogger, LogLevel } from "./Logger";
import {
  SwNodeRunnerContextType,
  SwNodeValue,
  SwNode,
  SwNodeResult,
  SwNodeMap,
  SwNodeEffectMap,
  SwNodeExtraContext,
  GetEffectContext,
  GetNodeContext,
  GetEffectMapFromNodeMap,
} from "../nodes";
import {
  createSwNodeRef,
  CreateSwNodeRef,
  isSwNodeRef,
  ResolveSwNodeRefs,
  SwNodeRef,
  SwNodeRefAccessorSchema,
  SwNodeRefAccessorSchemaMap,
} from "../refs";
import { SwEffect, SwEffectExtraContext, SwEffectParam, SwEffectResult } from "../effects";
import { SwScope, SwScopeType, SwSpaceScope } from "../scopes";

// Initialize the logger
const logger = createLogger({
  name: "GraphRunner",
  level:
    (typeof process !== "undefined" && Object.values(LogLevel).find((l) => l === process.env.LOG_LEVEL)) ||
    LogLevel.INFO,
  enabled: typeof process !== "undefined" ? process.env.DISABLE_STREAMWEAVE_LOG !== "true" : true,
});

type OmitUnion<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export interface SwCacheProvider {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export interface SwEffectTraceRevertEntry<Effect extends SwEffect = SwEffect> {
  id: string;
  effectId: string;
  effect: Effect;
  request: SwEffectParam<Effect>;
  result: SwEffectResult<Effect>;
  context: SwEffectExtraContext<Effect>;
}

export interface SwRevertProvider {
  filterEffects?(effectTraces: SwEffectTraceRevertEntry[]): Promise<string[]>;
  onEffectsReverted?(effectTraces: SwEffectTraceRevertEntry[]): void;
}

export type GraphTraceEvent =
  | { type: "start"; timestamp: number; runId: string }
  | { type: "start-node"; ni: SwNodeInstance; timestamp: number; runId: string }
  | { type: "end-node"; ni: SwNodeInstance; timestamp: number; runId: string }
  | { type: "end"; timestamp: number; runId: string };
export type SwNodeTraceEvent =
  | { type: "start"; resolvedValue: ResolveSwNodeRefs<SwNodeValue<SwNode>>; timestamp: number; runId: string }
  | {
      // used when creating a node for a dependency
      type: "dependency";
      ni: SwNodeInstance;
      timestamp: number;
      runId: string;
    }
  | {
      type: "dependency-result";
      ni: SwNodeInstance;
      existing?: boolean; // whether a node needed to be created
      result: SwNodeResult<SwNode>;
      timestamp: number;
      runId: string;
    }
  | { type: "dependant"; ni: SwNodeInstance; timestamp: number; runId: string }
  | { type: "find-node"; ni: SwNodeInstance; result: SwNodeResult<SwNode>; timestamp: number; runId: string }
  | { type: "effect-request"; traceId: string; effectId: string; request: unknown; timestamp: number; runId: string }
  | { type: "effect-result"; traceId: string; effectId: string; result: unknown; timestamp: number; runId: string }
  | { type: "error"; message: string; error: unknown; timestamp: number; runId: string }
  | { type: "result"; result: SwNodeResult<SwNode>; timestamp: number; runId: string };

export interface SwScopeInstance {
  id: string;
  def: SwScope;
  parent: SwScopeInstance | null;
}

export interface SwNodeInstance<D extends SwNode = SwNode> {
  id: string;
  typeId: string;
  value: SwNodeValue<D>;

  scope: SwScopeInstance;
  dependencies?: string[]; // node ids
  state?: {
    result?: SwNodeResult<D>;

    startedAt?: number;
    completedAt?: number;
    error?: unknown;
    createdNodes?: string[]; // node ids
    trace?: SwNodeTraceEvent[];
  };
}

export interface ExportedNode {
  id: string;
  typeId: string;
  value: Record<string, unknown>;
  scope: SwScopeInstance;
  dependencies: string[] | undefined;
  state: SwNodeInstance["state"];
}

/**
 * Use `ExtractGraphRunner` to access this type
 */
export class GraphRunner<NodeMap extends SwNodeMap> extends EventEmitter<{
  dataChanged: [];
}> {
  private nodeInstances: Record<string, SwNodeInstance> = {}; // id -> node instance
  private trace: GraphTraceEvent[] = [];
  private effectMap: GetEffectMapFromNodeMap<NodeMap> = {} as GetEffectMapFromNodeMap<NodeMap>;

  private runId = "";
  private abortController: AbortController | null = null;
  private nodeTypeIdMap: WeakMap<SwNode, string> = new WeakMap();
  private startNodeCount = 0;

  public constructor(
    private readonly nodeMap: NodeMap,
    private readonly effectContext: GetEffectContext<NodeMap>,
    private readonly nodeContext: GetNodeContext<NodeMap>,
    private readonly cacheProvider: SwCacheProvider | undefined,
    private readonly revertProvider: SwRevertProvider | undefined,
  ) {
    super();
    Object.values(nodeMap).forEach((def) => {
      Object.entries(def.effectMap).forEach(([effectId, effect]) => {
        if (this.effectMap[effectId] && this.effectMap[effectId] !== effect) {
          throw new Error(`Conflicting effect definitions: ${effectId}`);
        } else {
          (this.effectMap as any)[effectId] = effect;
        }
      });
    });
  }

  get nodes() {
    return Object.fromEntries(
      Object.entries(this.nodeMap).map(
        ([key, def]) =>
          [
            key,
            {
              def,
              run: (value: SwNodeValue<SwNode>, signal?: AbortSignal) => this.runNode(def, value, signal),
            },
          ] as const,
      ),
    ) as {
      [K in keyof NodeMap]: {
        def: NodeMap[K];
        run: (value: SwNodeValue<NodeMap[K]>, signal?: AbortSignal) => Promise<SwNodeResult<NodeMap[K]>>;
      };
    };
  }

  public static fromData<NodeMap extends SwNodeMap>(
    ...[nodeMap, effectContext, nodeContext, cacheProvider, revertProvider, data]: [
      ...ConstructorParameters<typeof GraphRunner<NodeMap>>,
      GraphRunnerData,
    ]
  ) {
    const graphRunner = new GraphRunner(nodeMap, effectContext, nodeContext, cacheProvider, revertProvider);
    graphRunner.nodeInstances = cloneDeep(data.nodeInstances);
    graphRunner.trace = [...data.trace];
    return graphRunner;
  }

  /**
   * Start a node. This doesn't do any checks to ensure the node is runnable.
   *
   * @param ni The node to start
   * @param queueNode Queue a node for execution, usually used to track new nodes
   * @param waitForNode Wait for the given node to complete, starting it if necessary. Can be used on new nodes
   * @returns The result of the node
   */
  private async startNode<D extends SwNode>(
    ni: SwNodeInstance<D>,
    signal: AbortSignal,
    queueNode: (ni: SwNodeInstance) => void,
    waitForNode: <D2 extends SwNode>(ni: SwNodeInstance<D2>) => Promise<SwNodeResult<D2>>,
  ): Promise<SwNodeResult<D>> {
    if (signal.aborted) throw new RunStoppedError();
    const startNodeIndex = ++this.startNodeCount;
    logger.info(`Starting node ${startNodeIndex} "${ni.typeId}"`, ni.value);
    this.addTrace({ type: "start-node", ni });

    const node = this.getNodeDef(ni);

    const runEffect = async <P, R, EEC, ERR, ER extends (...args: any[]) => Promise<ERR>>(
      effectId: string,
      effect: SwEffect<P, R, EEC, ER>,
      params: Parameters<ER>,
    ): Promise<ERR> => {
      if (signal.aborted) throw new RunStoppedError();

      return effect.wrap(async (param) => {
        if (signal.aborted) throw new RunStoppedError();

        const traceId = newId.traceEffect();
        logger.info(`Running effect "${effectId}" for node ${startNodeIndex} "${ni.typeId}"`, param);
        this.addNiTrace(ni, { type: "effect-request", traceId, effectId, request: param });

        let result: R | undefined;
        try {
          // resolve cache key if effect is cacheable
          let cacheKey: string | null = null;
          if (effect.cacheable) {
            if (!this.cacheProvider) throw new Error("Cache provider not set");

            if (effect.generateCacheKey) {
              const effectCacheKey = effect.generateCacheKey(param);
              if (effectCacheKey) {
                cacheKey = typeof effectCacheKey === "string" ? effectCacheKey : await generateCacheKey(effectCacheKey);
              }
            } else {
              cacheKey = `effect-${effectId}-${await generateCacheKey({ param })}`;
            }
          }

          // check cache for existing result
          if (cacheKey) {
            const cachedValue = await this.cacheProvider!.get<R>(cacheKey);
            if (cachedValue) {
              logger.info(
                `Cached result for effect "${effectId}" on node ${startNodeIndex} "${ni.typeId}"`,
                cachedValue,
              );
              return cachedValue;
            }
          }

          // run effect
          result = await effect.run(param, {
            effectContext: this.effectContext as EEC,
            signal,
          });

          logger.debug(`Effect result for "${effectId}" on node ${startNodeIndex} "${ni.typeId}"`, result);
          if (cacheKey) await this.cacheProvider!.set(cacheKey, result);
          return result;
        } catch (e) {
          logger.error(`Effect "${effectId}" failed on node ${startNodeIndex} "${ni.typeId}"`, e);
          throw e;
        } finally {
          this.addNiTrace(ni, { type: "effect-result", traceId, effectId, result });
        }
      })(...params);
    };

    const nodeRunnerContext: SwNodeRunnerContextType<SwNodeEffectMap<D>, SwNodeExtraContext<D>> = {
      nodeContext: this.nodeContext as SwNodeExtraContext<D>,
      effects: new Proxy(
        {},
        {
          get: (_, effectId) => {
            const effect = node.effectMap[effectId];
            if (!effect) throw new Error(`Effect not found: ${String(effectId)}`);
            return (...args: any[]) => runEffect(effectId as string, effect, args);
          },
        },
      ) as any,

      runNode: async (nodeDef, nodeValue) => {
        let depNi = this.findNodeInstance(ni.scope, nodeDef, nodeValue);
        let subResult: SwNodeResult<typeof nodeDef>;
        let existing = undefined;
        if (depNi) {
          logger.debug("Found existing node", depNi.value);
          if (!depNi.state?.result) throw new Error("Node result not found"); // this shouldn't happen since deps are processed first
          existing = true;
          subResult = depNi.state.result;
          ni.dependencies = uniq([...(ni.dependencies || []), depNi.id]);
        } else {
          logger.debug("Adding dependency node", nodeValue);
          depNi = this.addNode(nodeDef, nodeValue, ni.scope);
          (ni.dependencies ||= []).push(depNi.id);
          ((ni.state ||= {}).createdNodes ||= []).push(depNi.id);
          this.addNiTrace(ni, { type: "dependency", ni: depNi });

          subResult = await waitForNode(depNi);
        }

        logger.debug("Dependency result", subResult);
        this.addNiTrace(ni, { type: "dependency-result", ni: depNi, existing, result: subResult });

        return subResult;
      },
      findNode: async (nodeDef, filter) => {
        const foundNi = this.findNodeInstance(ni.scope, nodeDef, (n) =>
          filter(n.value, { scope: n.scope.def, isCurrentScope: n.scope.id === ni.scope.id }),
        );
        if (!foundNi) return null;

        ni.dependencies = uniq([...(ni.dependencies || []), foundNi.id]);
        const result = foundNi.state?.result || (await waitForNode(foundNi));

        this.addNiTrace(ni, { type: "find-node", ni: foundNi, result });
        return result;
      },

      queueNode: (newNodeDef, newNodeValue) => {
        logger.debug("Adding dependant node", newNodeValue);
        const newNi = this.addNode(newNodeDef, newNodeValue, ni.scope, [ni.id]);
        ((ni.state ||= {}).createdNodes ||= []).push(newNi.id);
        queueNode(newNi);
        this.addNiTrace(ni, { type: "dependant", ni: newNi });
      },

      newRef: createNodeRefFactory(ni.id),
    };

    const accessedNodeIds = new Set<string>();
    const nodeResolvedValue = resolveNodeValueRefs(ni.value, this.nodeInstances, accessedNodeIds); // resolve refs in input
    ni.dependencies = uniq([...(ni.dependencies || []), ...Array.from(accessedNodeIds)]); // add all nodes that were accessed as direct deps

    (ni.state ||= {}).startedAt = Date.now();
    this.addNiTrace(ni, { type: "start", resolvedValue: nodeResolvedValue });

    // todo error handling
    const result = await node.run(nodeResolvedValue, nodeRunnerContext);

    ni.state.completedAt = Date.now();
    ni.state.result = result;
    this.addNiTrace(ni, { type: "result", result });

    this.addTrace({ type: "end-node", ni });
    logger.debug(`Result for node ${startNodeIndex} "${ni.typeId}"`, result);
    logger.info(`Completed node ${startNodeIndex} "${ni.typeId}"`);
    return result;
  }

  public async runNode<D extends SwNode>(node: D, value: SwNodeValue<D>, signal?: AbortSignal) {
    const ni = this.addNode(node, value, this.newNodeScopeInstance({ type: SwScopeType.NodeRun }));
    await this.run({ signal });
    return ni.state!.result as SwNodeResult<D>;
  }

  public async run({ signal }: { signal?: AbortSignal } = {}) {
    this.runId = newId.graphRun();
    const abortController = new AbortController();
    if (signal) signal.addEventListener("abort", () => abortController.abort());
    const abortSignal = abortController.signal;
    this.abortController = abortController;
    const abortPromise = new Promise((resolve, reject) => {
      abortSignal.addEventListener("abort", () => reject(new RunStoppedError()), { once: true });
    });

    try {
      this.addTrace({ type: "start" });

      const runStack = Object.values(this.nodeInstances).filter((ni) => !ni.state?.completedAt);
      runStack.forEach((ni) => {
        if (ni.state?.startedAt && !ni.state.completedAt) {
          logger.warn("Node started but not completed, clearing state", ni.value);
          delete ni.state;
        }
      });
      const nodePromises = new Map<string, Promise<SwNodeResult<SwNode>>>();

      const startNodeWrapped = (ni: SwNodeInstance): Promise<SwNodeResult<SwNode>> => {
        if (!nodePromises.has(ni.id)) {
          if (!this.isNodeInstanceRunnable(ni)) {
            logger.error("Node is not runnable", ni.value);
            throw new Error("Node is not runnable");
          }
          if (ni.state?.startedAt) {
            logger.warn("Node marked as already started", ni.value);
          }
          nodePromises.set(
            ni.id,
            (async () => {
              try {
                return await this.startNode(
                  ni,
                  abortSignal,
                  (newNode) => runStack.push(newNode),
                  startNodeWrapped as any,
                );
              } catch (e) {
                logger.error("Node failed", ni.value, e);
                (ni.state ||= {}).error = e;
                this.addNiTrace(ni, { type: "error", message: formatError(e), error: e });
                throw e;
              }
            })(),
          );
        }
        return nodePromises.get(ni.id)!;
      };

      // run the graph, keep consuming nodes until all nodes are completed
      while (runStack.length > 0) {
        const runnableNodes = runStack.filter((ni) => this.isNodeInstanceRunnable(ni));
        if (runnableNodes.length === 0) {
          logger.error("No runnable nodes", runStack);
          throw new Error("No runnable nodes");
        }
        runnableNodes.forEach((ni) => runStack.splice(runStack.indexOf(ni), 1));

        // run all runnable nodes in parallel
        await Promise.race([Promise.all(runnableNodes.map(startNodeWrapped)), abortPromise]);
      }
      // todo clean up any outstanding promises with rejects
    } finally {
      this.addTrace({ type: "end" });
      this.runId = "";
      this.abortController = null;
    }
  }

  public stopRun(): void {
    this.abortController?.abort();
  }

  public toData() {
    return { nodeInstances: { ...this.nodeInstances }, trace: [...this.trace] };
  }

  public hasRunnableNodes() {
    return Object.values(this.nodeInstances).some((ni) => this.isNodeInstanceRunnable(ni));
  }

  public isNodeInstanceRunnable(ni: SwNodeInstance) {
    return !ni.state?.completedAt && !ni.dependencies?.some((id) => !this.nodeInstances[id]?.state?.completedAt);
  }

  public getNodeTypeId<D extends SwNode>(nodeDef: D) {
    let typeId = this.nodeTypeIdMap.get(nodeDef);
    if (typeId) return typeId;

    typeId = Object.entries(this.nodeMap).find(([_, def]) => def === nodeDef)?.[0];
    if (!typeId) throw new Error("Node not found in nodeMap");

    this.nodeTypeIdMap.set(nodeDef, typeId);
    return typeId;
  }

  /**
   * Resolves nodes, respecting scope
   *
   * @param scope - The scope to search within, or undefined to search all scopes
   *                  When given a scope instance, this will climb up the scope hierarchy until it finds a node
   */
  public findNodeInstance<Node extends SwNode>(
    scope: SwScopeInstance | SwScope | undefined,
    node: Node,
    filter: SwNodeValue<Node> | ((ni: SwNodeInstance<Node>) => boolean),
    maxDepth = 100,
  ): SwNodeInstance<Node> | undefined {
    if (maxDepth === 0) return undefined;
    const typeId = this.getNodeTypeId(node);
    const filterFunc = isFunction(filter) ? filter : (n: SwNodeInstance<Node>) => isEqual(n.value, filter);

    // find node in current scope
    let nodeInScope = Object.values(this.nodeInstances);
    if (scope) {
      if ("id" in scope) {
        nodeInScope = nodeInScope.filter((n) => n.scope.id === scope.id);
      } else {
        nodeInScope = nodeInScope.filter((n) => n.scope.def.type === scope.type);
      }
    }
    const foundNode = nodeInScope.find(
      (n): n is SwNodeInstance<Node> => n.typeId === typeId && filterFunc(n as SwNodeInstance<Node>),
    );
    if (foundNode) return foundNode;

    // search parent scope
    if (!scope || !("id" in scope) || !scope?.parent) return undefined;
    return this.findNodeInstance(scope.parent, node, filterFunc, maxDepth - 1);
  }

  private newNodeScopeInstance(scope: SwScope, parent?: SwScopeInstance | null): SwScopeInstance {
    return { id: newId.nodeScope(), def: scope, parent: parent || null };
  }

  public addNode<D extends SwNode>(
    nodeDef: D,
    nodeValue: SwNodeValue<D>,
    parentScope?: SwScopeInstance,
    dependencies?: string[],
  ) {
    // resolve scope
    let scopeOrInstance = nodeDef.scopeFactory?.(parentScope?.def || SwSpaceScope) || parentScope || SwSpaceScope;
    let scope: SwScopeInstance | undefined;

    if ("id" in scopeOrInstance) {
      scope = scopeOrInstance;
    } else {
      if (scopeOrInstance.type === SwScopeType.Space) {
        // handle space/global scope
        Object.values(this.nodeInstances).forEach((n) => {
          if (n.scope.def.type === SwScopeType.Space) {
            scope = n.scope;
          }
        });
        // if no space scope is found, create a new one
        if (!scope) scope = this.newNodeScopeInstance(SwSpaceScope, null);
      } else {
        // if the scope factory returns a task scope, always create a child scope
        scope = this.newNodeScopeInstance(scopeOrInstance, parentScope);
      }
    }

    const typeId = this.getNodeTypeId(nodeDef);
    const duplicateNode = this.findNodeInstance(scope, nodeDef, nodeValue);
    if (duplicateNode) {
      logger.warn("Duplicate node found while adding node", typeId, nodeValue, duplicateNode.id);
      return duplicateNode;
    }

    const ni: SwNodeInstance<D> = { id: newId.graphNode(), typeId, value: nodeValue, scope, dependencies };
    this.nodeInstances[ni.id] = ni;
    this.emit("dataChanged");
    return ni;
  }

  public async editNode(nodeId: string, apply: (ni: SwNodeInstance) => void) {
    const ni = this.nodeInstances[nodeId];
    if (!ni) throw new Error("Node not found");

    this.nodeInstances[nodeId] = produce(ni, apply);
    await this.resetNode(nodeId);
  }

  public async resetNode(nodeId: string) {
    const filterEffectTrace = (
      t: SwNodeTraceEvent,
    ): t is SwNodeTraceEvent & { type: "effect-request" | "effect-result" } =>
      t.type === "effect-request" || t.type === "effect-result";
    const effectTraces: (SwNodeTraceEvent & { type: "effect-request" | "effect-result" })[] = [];

    const reset = (rNode: SwNodeInstance) => {
      // track effect results
      effectTraces.push(...(rNode.state?.trace?.filter(filterEffectTrace) || []));

      // delete all nodes created as a side effect of this node
      const deletedNodes = new Set<string>();
      const deleteNode = (subNodeId: string) => {
        if (deletedNodes.has(subNodeId)) return;
        deletedNodes.add(subNodeId);

        const delNode = this.nodeInstances[subNodeId];
        if (!delNode) return;
        delNode.state?.createdNodes?.forEach((id) => deleteNode(id));

        // track effect results
        effectTraces.push(...(delNode.state?.trace?.filter(filterEffectTrace) || []));
        delete this.nodeInstances[subNodeId];
      };
      rNode.state?.createdNodes?.forEach((id) => deleteNode(id));

      // clear node state
      delete rNode.state;

      // remove deleted nodes from other nodes' dependencies
      Object.values(this.nodeInstances).forEach((n) => {
        n.dependencies = n.dependencies?.filter((id) => !deletedNodes.has(id));
      });

      // reset any dependants
      const dependants = Object.values(this.nodeInstances).filter((n) => n.dependencies?.includes(rNode.id));
      dependants.forEach((n) => reset(n));
    };
    const ni = this.nodeInstances[nodeId];
    if (!ni) throw new Error("Node not found");
    reset(ni);
    this.emit("dataChanged");

    const abortSignal = new AbortController().signal; // todo expose this?
    const effectCtx = { effectContext: this.effectContext, signal: abortSignal };

    // collect revertable effect instances
    const revertableEffects = effectTraces
      .map((req) => {
        if (req.type !== "effect-request") return null;
        const effect = this.effectMap[req.effectId];
        if (!effect) return null;
        const resultTrace = effectTraces.find(
          (res) => res.type === "effect-result" && req.effectId === res.effectId,
        ) as (SwNodeTraceEvent & { type: "effect-result" }) | undefined;
        if (!resultTrace) return null;
        if (!effect.canRevert?.(req.request, resultTrace.result, effectCtx)) return null;
        return {
          id: req.traceId,
          effectId: req.effectId,
          effect,
          request: req.request,
          result: resultTrace.result,
          context: this.effectContext,
        };
      })
      .filter((v) => !!v);

    // use the revert provider to select effects to revert, or just revert all if no provider is provided
    if (revertableEffects.length) {
      const selectedTraces = await this.revertProvider?.filterEffects?.(revertableEffects);
      const effectsToRevert =
        selectedTraces !== undefined
          ? revertableEffects.filter((w) => selectedTraces!.includes(w.id))
          : revertableEffects;
      for (const { effect, request, result } of effectsToRevert) {
        await effect.revert?.(request, result, {
          effectContext: this.effectContext,
          signal: abortSignal,
        });
      }
      this.revertProvider?.onEffectsReverted?.(effectsToRevert);
    }
  }

  public async deleteNode(nodeId: string) {
    await this.resetNode(nodeId);
    Object.values(this.nodeInstances).forEach((n) => {
      n.dependencies = n.dependencies?.filter((id) => id !== nodeId);
    });
    delete this.nodeInstances[nodeId];
    this.emit("dataChanged");
  }

  public getNodeDef<D extends SwNode>(node: SwNodeInstance<D>) {
    const [_, nodeDef] = Object.entries(this.nodeMap).find(([typeId]) => typeId === node.typeId) || [];
    if (!nodeDef) throw new Error(`Node type not found: ${node.typeId}, make sure it's registered`);
    return nodeDef as D;
  }

  public getEffect(typeId: keyof typeof this.effectMap) {
    const effectDef = this.effectMap[typeId];
    if (!effectDef) throw new Error(`Effect type not found: ${String(typeId)}, make sure it's registered`);
    return effectDef;
  }

  public getActiveRunId() {
    return this.runId;
  }

  private addTrace(event: OmitUnion<GraphTraceEvent, "timestamp" | "runId">) {
    this.trace.push({ ...event, timestamp: Date.now(), runId: this.runId });
    logger.trace("Trace event", event);
    this.emit("dataChanged"); // whenever there's a change, there should be a trace, so this effectively occurs on every change to the top level data
  }
  private addNiTrace(ni: SwNodeInstance, event: OmitUnion<SwNodeTraceEvent, "timestamp" | "runId">) {
    ((ni.state ||= {}).trace ||= []).push({
      ...event,
      timestamp: Date.now(),
      runId: this.runId,
    });
    logger.trace(`Node trace for ${ni.typeId}:${ni.id}`, event);
    this.emit("dataChanged"); // whenever there's a change, there should be a trace, so this effectively occurs on every change to the node data
  }

  public exportNode(nodeId: string): ExportedNode {
    const node = this.nodeInstances[nodeId];
    if (!node) throw new Error(`Node not found: ${nodeId}`);

    return {
      id: node.id,
      typeId: node.typeId,
      value: node.value,
      scope: node.scope,
      dependencies: node.dependencies,
      state: node.state,
    };
  }
}
export type GraphRunnerData = ReturnType<GraphRunner<{}>["toData"]>;

export function resolveNodeRef<T extends SwNodeRefAccessorSchema>(
  ref: SwNodeRef<T> | SwNodeRefAccessorSchemaMap[T],
  nodeMap: Record<string, SwNodeInstance>,
  accessedNodeIds?: Set<string>,
): SwNodeRefAccessorSchemaMap[T] | undefined {
  if (!isSwNodeRef<T>(ref)) return ref;

  const ni = nodeMap[ref.nodeId];
  if (!ni) throw new Error(`Node for ref not found: ${ref.nodeId}`);
  if (accessedNodeIds) accessedNodeIds.add(ni.id);

  const accessor = ref.accessor as SwNodeRef<SwNodeRefAccessorSchema>["accessor"];
  let source: unknown;
  switch (accessor.type) {
    case "value":
      source = ni.value;
      break;
    case "result":
      source = ni.state?.result;
      break;
    default:
      const _exhaustiveCheck: never = accessor.type;
      throw new Error(`Unexpected accessor type: ${_exhaustiveCheck}`);
  }
  const val = get(source, accessor.path);

  if (val === undefined) return undefined;
  return SwNodeRefAccessorSchemaMap[accessor.schema]!.parse(val) as SwNodeRefAccessorSchemaMap[T];
}

export function resolveNodeValueRefs<T extends SwNode>(
  value: SwNodeValue<T>,
  nodeMap: Record<string, SwNodeInstance>,
  accessedNodeIds?: Set<string>,
): ResolveSwNodeRefs<SwNodeValue<T>> {
  const resolved = {} as ResolveSwNodeRefs<SwNodeValue<T>>;
  Object.entries(value).forEach(([key, val]) => {
    resolved[key as keyof SwNodeValue<T>] = !isSwNodeRef(val)
      ? (val as SwNodeValue<T>[keyof SwNodeValue<T>])
      : resolveNodeRef<SwNodeValue<T>[keyof SwNodeValue<T>]>(val, nodeMap, accessedNodeIds) ??
        throwError(`Node ref not resolved: ${key}`);
  });
  return resolved;
}

export class RunStoppedError extends Error {
  public constructor() {
    super("Run was stopped");
    this.name = "RunStoppedError";
  }
}

const createNodeRefFactory =
  (nodeId: string): CreateSwNodeRef =>
  (accessor) =>
    createSwNodeRef(nodeId, accessor);
