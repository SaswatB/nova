import { EventEmitter } from "events";
import { produce } from "immer";
import cloneDeep from "lodash/cloneDeep";
import get from "lodash/get";
import isEqual from "lodash/isEqual";
import isFunction from "lodash/isFunction";
import uniq from "lodash/uniq";
import { match } from "ts-pattern";
import zodToJsonSchema from "zod-to-json-schema";

import { IterationMode, OmitUnion } from "@repo/shared";

import { formatError, throwError } from "../err";
import { RouterInput, RouterOutput } from "../trpc-client";
import { newId } from "../uid";
import { ApplyFileChangesNNode } from "./defs/ApplyFileChangesNNode";
import { ContextNNode } from "./defs/ContextNNode";
import { ExecuteNNode, ExecuteNNode_ContextId } from "./defs/ExecuteNNode";
import { OutputNNode } from "./defs/OutputNNode";
import {
  PlanNNode,
  PlanNNode_ContextId,
  PlanNNode_PrevIterationChangeSetContextId,
  PlanNNode_PrevIterationGoalContextId,
  PlanNNodeValue,
} from "./defs/PlanNNode";
import { ProjectAnalysisNNode } from "./defs/ProjectAnalysisNNode";
import { RelevantFileAnalysisNNode } from "./defs/RelevantFileAnalysisNNode";
import { TypescriptDepAnalysisNNode } from "./defs/TypescriptDepAnalysisNNode";
import { WebResearchHelperNNode } from "./defs/WebResearchHelperNNode";
import { WebResearchOrchestratorNNode } from "./defs/WebResearchOrchestratorNNode";
import { WebScraperNNode } from "./defs/WebScraperNNode";
import { aiChat, aiJson, aiScrape, aiWebSearch } from "./ai-chat";
import { NNodeDef, NNodeResult, NNodeValue, NodeRunnerContext, NodeScopeDef, NodeScopeType, NSDef } from "./node-types";
import { ProjectContext } from "./project-ctx";
import {
  CreateNodeRef,
  isNodeRef,
  NNodeRef,
  NNodeRefAccessorSchema,
  NNodeRefAccessorSchemaMap,
  nnodeRefSymbol,
  ResolveRefs,
} from "./ref-types";

export type GraphTraceEvent =
  | { type: "start"; timestamp: number; runId: string }
  | { type: "start-node"; node: NNode; timestamp: number; runId: string }
  | { type: "end-node"; node: NNode; timestamp: number; runId: string }
  | { type: "end"; timestamp: number; runId: string };
export type NNodeTraceEvent =
  | { type: "start"; resolvedValue: ResolveRefs<NNodeValue<NNodeDef>>; timestamp: number; runId: string }
  | {
      // used when creating a node for a dependency
      type: "dependency";
      node: NNode;
      timestamp: number;
      runId: string;
    }
  | {
      type: "dependency-result";
      node: NNode;
      existing?: boolean; // whether a node needed to be created
      result: NNodeResult<NNodeDef>;
      timestamp: number;
      runId: string;
    }
  | { type: "dependant"; node: NNode; timestamp: number; runId: string }
  | { type: "find-node"; node: NNode; result: NNodeResult<NNodeDef>; timestamp: number; runId: string }
  | {
      type: "get-cache";
      key: string;
      result: unknown;
      timestamp: number;
      runId: string;
    }
  | {
      type: "set-cache";
      key: string;
      value: unknown;
      timestamp: number;
      runId: string;
    }
  | {
      type: "read-file";
      path: string;
      result: Awaited<ReturnType<NodeRunnerContext["readFile"]>>;
      timestamp: number;
      runId: string;
    }
  | {
      type: "write-file";
      path: string;
      content: string;
      original?: string;
      created?: boolean;
      dryRun?: boolean;
      timestamp: number;
      runId: string;
    }
  | {
      type: "ai-chat-request";
      chatId: string;
      model: string;
      messages: RouterInput["ai"]["chat"]["messages"];
      timestamp: number;
      runId: string;
    }
  | {
      type: "ai-chat-response";
      chatId: string;
      result: string;
      timestamp: number;
      runId: string;
    }
  | {
      type: "ai-json-request";
      chatId: string;
      schema: unknown;
      input: string;
      prompt?: string;
      timestamp: number;
      runId: string;
    }
  | { type: "ai-json-response"; chatId: string; result: unknown; timestamp: number; runId: string }
  | { type: "ai-web-search-request"; chatId: string; query: string; timestamp: number; runId: string }
  | {
      type: "ai-web-search-response";
      chatId: string;
      result: RouterOutput["ai"]["webSearch"];
      timestamp: number;
      runId: string;
    }
  | {
      type: "ai-scrape-request";
      chatId: string;
      schema: unknown;
      url: string;
      prompt: string;
      timestamp: number;
      runId: string;
    }
  | { type: "ai-scrape-response"; chatId: string; result: unknown; timestamp: number; runId: string }
  | { type: "error"; message: string; error: unknown; timestamp: number; runId: string }
  | { type: "result"; result: NNodeResult<NNodeDef>; timestamp: number; runId: string };

export interface NNodeScope {
  id: string;
  def: NodeScopeDef;
  parent: NNodeScope | null;
}

export interface NNode<D extends NNodeDef = NNodeDef> {
  id: string;

  typeId: D["typeId"];
  value: NNodeValue<D>;

  scope: NNodeScope; // only undefined in legacy
  dependencies?: string[]; // node ids
  state?: {
    result?: NNodeResult<D>;

    startedAt?: number;
    completedAt?: number;
    error?: unknown;
    createdNodes?: string[]; // node ids
    trace?: NNodeTraceEvent[];
  };
}

/**
 * Resolves nodes, respecting scope
 */
function findNode<D extends NNodeDef>(
  scope: NNodeScope,
  def: D,
  filter: NNodeValue<D> | ((node: NNode<D>) => boolean),
  nodeMap: Record<string, NNode>, // used to look up nodes by scope
  maxDepth = 100,
): NNode<D> | undefined {
  if (maxDepth === 0) return undefined;
  const filterFunc = isFunction(filter) ? filter : (n: NNode<D>) => isEqual(n.value, filter);

  // find node in current scope
  const nodes = Object.values(nodeMap).filter((n) => n.scope.id === scope.id);
  const nodeInScope = nodes.find((n): n is NNode<D> => n.typeId === def.typeId && filterFunc(n as NNode<D>));
  if (nodeInScope) return nodeInScope;

  // search parent scope
  if (!scope.parent) return undefined;
  return findNode(scope.parent, def, filterFunc, nodeMap, maxDepth - 1);
}

export class GraphRunner extends EventEmitter<{ dataChanged: [] }> {
  private nodes: Record<string, NNode> = {}; // id -> node
  private trace: GraphTraceEvent[] = [];
  private nodeDefs: Record<string, NNodeDef> = {
    [ApplyFileChangesNNode.typeId]: ApplyFileChangesNNode,
    [ContextNNode.typeId]: ContextNNode,
    [ExecuteNNode.typeId]: ExecuteNNode,
    [OutputNNode.typeId]: OutputNNode,
    [PlanNNode.typeId]: PlanNNode,
    [ProjectAnalysisNNode.typeId]: ProjectAnalysisNNode,
    [RelevantFileAnalysisNNode.typeId]: RelevantFileAnalysisNNode,
    [TypescriptDepAnalysisNNode.typeId]: TypescriptDepAnalysisNNode,
    [WebResearchHelperNNode.typeId]: WebResearchHelperNNode,
    [WebResearchOrchestratorNNode.typeId]: WebResearchOrchestratorNNode,
    [WebScraperNNode.typeId]: WebScraperNNode,
  };

  private runId = "";
  private abortController: AbortController | null = null;

  private constructor(private projectContext: ProjectContext) {
    super();
  }

  public static fromGoal(projectContext: ProjectContext, planInput: PlanNNodeValue) {
    const graphRunner = new GraphRunner(projectContext);
    graphRunner.addNode(PlanNNode, planInput);
    return graphRunner;
  }

  public static fromData(projectContext: ProjectContext, data: GraphRunnerData) {
    const graphRunner = new GraphRunner(projectContext);
    graphRunner.nodes = cloneDeep(data.nodes);
    graphRunner.trace = [...data.trace];
    return graphRunner;
  }

  /**
   * Start a node. This doesn't do any checks to ensure the node is runnable.
   *
   * @param node The node to start
   * @param queueNode Queue a node for execution, usually used to track new nodes
   * @param waitForNode Wait for the given node to complete, starting it if necessary. Can be used on new nodes
   * @returns The result of the node
   */
  private async startNode<D extends NNodeDef>(
    node: NNode<D>,
    signal: AbortSignal,
    queueNode: (node: NNode) => void,
    waitForNode: <D2 extends NNodeDef>(node: NNode<D2>) => Promise<NNodeResult<D2>>,
  ): Promise<NNodeResult<D>> {
    if (signal.aborted) throw new RunStoppedError();
    console.log("[GraphRunner] Starting node", node.value);
    this.addTrace({ type: "start-node", node });

    const nodeRunnerContext: NodeRunnerContext = {
      settings: this.projectContext.settings,

      addDependantNode: (newNodeDef, newNodeValue) => {
        console.log("[GraphRunner] Adding dependant node", newNodeValue);
        const newNode = this.addNode(newNodeDef, newNodeValue, node.scope, [node.id]);
        ((node.state ||= {}).createdNodes ||= []).push(newNode.id);
        queueNode(newNode);
        this.addNodeTrace(node, { type: "dependant", node: newNode });
      },
      getOrAddDependencyForResult: async (nodeDef, nodeValue) => {
        let depNode = findNode(node.scope, nodeDef, nodeValue, this.nodes);
        let subResult: NNodeResult<typeof nodeDef>;
        let existing = undefined;
        if (depNode) {
          console.log("[GraphRunner] Found existing node", depNode.value);
          if (!depNode.state?.result) throw new Error("Node result not found"); // this shouldn't happen since deps are processed first
          existing = true;
          subResult = depNode.state.result;
          node.dependencies = uniq([...(node.dependencies || []), depNode.id]);
        } else {
          console.log("[GraphRunner] Adding dependency node", nodeValue);
          depNode = this.addNode(nodeDef, nodeValue, node.scope);
          (node.dependencies ||= []).push(depNode.id);
          ((node.state ||= {}).createdNodes ||= []).push(depNode.id);
          this.addNodeTrace(node, { type: "dependency", node: depNode });

          subResult = await waitForNode(depNode);
        }

        console.log("[GraphRunner] Dependency result", subResult);
        this.addNodeTrace(node, { type: "dependency-result", node: depNode, existing, result: subResult });

        return { ...subResult, createNodeRef: createNodeRefFactory(depNode.id) };
      },
      findNodeForResult: async (nodeDef, filter) => {
        const foundNode = findNode(
          node.scope,
          nodeDef,
          (n) => filter(n.value, { scopeDef: n.scope.def, isCurrentScope: n.scope.id === node.scope.id }),
          this.nodes,
        );
        if (!foundNode) return null;

        node.dependencies = uniq([...(node.dependencies || []), foundNode.id]);
        const result = foundNode.state?.result || (await waitForNode(foundNode));

        this.addNodeTrace(node, { type: "find-node", node: foundNode, result });
        return result;
      },
      createNodeRef: createNodeRefFactory(node.id),

      readFile: async (path) => {
        console.log("[GraphRunner] Read file", path);

        if (this.projectContext.settings.files?.blockedPaths?.some((bp) => path.startsWith(bp))) {
          console.log("[GraphRunner] Blocking read operation for:", path);
          return { type: "not-found" };
        }

        const result = await this.projectContext.readFile(path);
        this.addNodeTrace(node, { type: "read-file", path, result });
        return result;
      },
      writeFile: async (path, content) => {
        if (this.projectContext.dryRun) {
          console.log(`[GraphRunner] (Dry Run) Skipping write operation for: ${path}`);
          this.addNodeTrace(node, { type: "write-file", path, content, dryRun: true });
          return;
        }

        const { original, created } = await this.writeFile(path, content);
        this.addNodeTrace(node, { type: "write-file", path, content, original, created });
      },

      getCache: async (key, schema) => {
        const res = schema.safeParse(await this.projectContext.projectCacheGet(key));
        if (res.success) {
          this.addNodeTrace(node, { type: "get-cache", key, result: res.data });
          return res.data;
        }
        return undefined;
      },
      setCache: async (key, value) => {
        this.addNodeTrace(node, { type: "set-cache", key, value });
        return this.projectContext.projectCacheSet(key, value);
      },

      aiChat: async (model, messages) => {
        try {
          const traceId = newId.traceChat();
          this.addNodeTrace(node, { type: "ai-chat-request", chatId: traceId, model, messages });
          const result = await aiChat(this.projectContext, model, messages, signal);
          console.log("[GraphRunner] AI chat result", result);
          this.addNodeTrace(node, { type: "ai-chat-response", chatId: traceId, result });
          return result;
        } catch (e) {
          console.error(e);
          console.error(JSON.stringify(e, null, 2));
          throw e;
        }
      },
      aiJson: async (schema, data, prompt) => {
        try {
          const traceId = newId.traceChat();
          this.addNodeTrace(node, {
            type: "ai-json-request",
            chatId: traceId,
            schema: zodToJsonSchema(schema, "S").definitions?.S,
            input: data,
            prompt,
          });
          const result = await aiJson(this.projectContext, "gpt4o", schema, data, prompt, signal);
          console.log("[GraphRunner] AI JSON result", result);
          this.addNodeTrace(node, {
            type: "ai-json-response",
            chatId: traceId,
            result,
          });
          return result;
        } catch (e) {
          console.error(e);
          console.error(JSON.stringify(e, null, 2));
          throw e;
        }
      },
      aiWebSearch: async (query) => {
        try {
          const traceId = newId.traceChat();
          this.addNodeTrace(node, { type: "ai-web-search-request", chatId: traceId, query });
          const result = await aiWebSearch(this.projectContext, query, signal);
          console.log("[GraphRunner] AI Web Search result", result);
          this.addNodeTrace(node, { type: "ai-web-search-response", chatId: traceId, result });
          return result;
        } catch (e) {
          console.error(e);
          console.error(JSON.stringify(e, null, 2));
          throw e;
        }
      },
      aiScrape: async (schema, url, prompt) => {
        try {
          const traceId = newId.traceChat();
          this.addNodeTrace(node, {
            type: "ai-scrape-request",
            chatId: traceId,
            schema: zodToJsonSchema(schema, "S").definitions?.S,
            url,
            prompt,
          });
          const result = await aiScrape(this.projectContext, schema, url, prompt, signal);
          console.log("[GraphRunner] AI Scrape result", result);
          this.addNodeTrace(node, {
            type: "ai-scrape-response",
            chatId: traceId,
            result,
          });
          return result;
        } catch (e) {
          console.error(e);
          console.error(JSON.stringify(e, null, 2));
          throw e;
        }
      },

      displayToast: this.projectContext.displayToast,
      writeDebugFile: this.projectContext.writeDebugFile,
    };

    const accessedNodeIds = new Set<string>();
    const nodeResolvedValue = resolveNodeValueRefs(node.value, this.nodes, accessedNodeIds); // resolve refs in input
    node.dependencies = uniq([...(node.dependencies || []), ...Array.from(accessedNodeIds)]); // add all nodes that were accessed as direct deps

    (node.state ||= {}).startedAt = Date.now();
    this.addNodeTrace(node, { type: "start", resolvedValue: nodeResolvedValue });

    // todo error handling
    const result = await this.getNodeDef(node).run(nodeResolvedValue, nodeRunnerContext);

    node.state.completedAt = Date.now();
    node.state.result = result;
    this.addNodeTrace(node, { type: "result", result });

    this.addTrace({ type: "end-node", node });
    console.log("[GraphRunner] Node completed", node.value, nodeResolvedValue);
    return result;
  }

  public async run(signal?: AbortSignal) {
    this.runId = newId.graphRun();
    this.abortController = new AbortController();
    const abortSignal = signal ? AbortSignal.any([signal, this.abortController.signal]) : this.abortController.signal;
    const abortPromise = new Promise((resolve, reject) => {
      abortSignal.addEventListener("abort", () => reject(new RunStoppedError()), { once: true });
    });

    try {
      this.addTrace({ type: "start" });
      await this.projectContext.ensureFS();

      const runStack = Object.values(this.nodes).filter((node) => !node.state?.completedAt);
      runStack.forEach((node) => {
        if (node.state?.startedAt && !node.state.completedAt) {
          console.warn("[GraphRunner] Node started but not completed, clearing state", node.value);
          delete node.state;
        }
      });
      const nodePromises = new Map<string, Promise<NNodeResult<NNodeDef>>>();

      const startNodeWrapped = (node: NNode): Promise<NNodeResult<NNodeDef>> => {
        if (!nodePromises.has(node.id)) {
          if (!this.isNodeRunnable(node)) {
            console.error("[GraphRunner] Node is not runnable", node.value);
            throw new Error("Node is not runnable");
          }
          if (node.state?.startedAt) {
            console.warn("[GraphRunner] Node marked as already started", node.value);
          }
          nodePromises.set(
            node.id,
            (async () => {
              try {
                return await this.startNode(
                  node,
                  abortSignal,
                  (newNode) => runStack.push(newNode),
                  startNodeWrapped as any,
                );
              } catch (e) {
                console.error("[GraphRunner] Node failed", node.value, e);
                (node.state ||= {}).error = e;
                this.addNodeTrace(node, { type: "error", message: formatError(e), error: e });
                throw e;
              }
            })(),
          );
        }
        return nodePromises.get(node.id)!;
      };

      // run the graph, keep consuming nodes until all nodes are completed
      while (runStack.length > 0) {
        const runnableNodes = runStack.filter((node) => this.isNodeRunnable(node));
        if (runnableNodes.length === 0) {
          console.log("[GraphRunner] No runnable nodes", runStack);
          throw new Error("No runnable nodes");
        }
        runnableNodes.forEach((node) => runStack.splice(runStack.indexOf(node), 1));

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
    return { nodes: { ...this.nodes }, trace: [...this.trace] };
  }

  public hasRunnableNodes() {
    return Object.values(this.nodes).some((node) => this.isNodeRunnable(node));
  }

  public isNodeRunnable(node: NNode) {
    return !node.state?.completedAt && !node.dependencies?.some((id) => !this.nodes[id]?.state?.completedAt);
  }

  public async writeFile(path: string, content: string) {
    console.log("[GraphRunner] Write file", path);
    const fileExisted = (await this.projectContext.readFile(path)).type !== "not-found";
    const result = await this.projectContext.writeFile(path, content);
    return { original: result, created: !fileExisted };
  }

  public async deleteFile(path: string) {
    console.log("[GraphRunner] Delete file", path);
    await this.projectContext.deleteFile(path);
  }

  public addNode<D extends NNodeDef>(
    nodeDef: D,
    nodeValue: NNodeValue<D>,
    parentScope?: NNodeScope,
    dependencies?: string[],
  ) {
    // resolve scope
    let scope = parentScope;
    if (!scope || nodeDef.scopeDef?.type === NodeScopeType.Space) {
      Object.values(this.nodes).forEach((n) => {
        if (n.scope.def.type === NodeScopeType.Space) {
          scope = n.scope;
        }
      });
      // if no space scope is found, create a new one
      if (!scope) scope = { id: newId.nodeScope(), def: NSDef.space, parent: null };
    }
    // create a child scope
    if (nodeDef.scopeDef && nodeDef.scopeDef.type !== NodeScopeType.Space) {
      scope = { id: newId.nodeScope(), def: nodeDef.scopeDef, parent: scope };
    }

    const duplicateNode = findNode(scope, nodeDef, nodeValue, this.nodes);
    if (duplicateNode) {
      console.warn("[GraphRunner] Duplicate node found while adding node", nodeDef.typeId, nodeValue, duplicateNode.id);
      return duplicateNode;
    }

    const node: NNode<D> = { id: newId.graphNode(), typeId: nodeDef.typeId, value: nodeValue, scope, dependencies };
    this.nodes[node.id] = node;
    this.emit("dataChanged");
    return node;
  }

  public async editNode(nodeId: string, apply: (node: NNode) => void) {
    const node = this.nodes[nodeId];
    if (!node) throw new Error("Node not found");

    this.nodes[nodeId] = produce(node, apply);
    await this.resetNode(nodeId);
  }

  public async resetNode(nodeId: string) {
    const fileWrites: (NNodeTraceEvent & { type: "write-file" })[] = [];

    const reset = (rNode: NNode) => {
      // track file writes
      fileWrites.push(
        ...(rNode.state?.trace?.filter((t): t is NNodeTraceEvent & { type: "write-file" } => t.type === "write-file") ||
          []),
      );

      // delete all nodes created as a side effect of this node
      const deletedNodes = new Set<string>();
      const deleteNode = (subNodeId: string) => {
        if (deletedNodes.has(subNodeId)) return;
        deletedNodes.add(subNodeId);

        const delNode = this.nodes[subNodeId];
        if (!delNode) return;
        delNode.state?.createdNodes?.forEach((id) => deleteNode(id));

        // track file writes
        fileWrites.push(
          ...(delNode.state?.trace?.filter(
            (t): t is NNodeTraceEvent & { type: "write-file" } => t.type === "write-file" && !t.dryRun,
          ) || []),
        );
        delete this.nodes[subNodeId];
      };
      rNode.state?.createdNodes?.forEach((id) => deleteNode(id));

      // clear node state
      delete rNode.state;

      // remove deleted nodes from other nodes' dependencies
      Object.values(this.nodes).forEach((n) => {
        n.dependencies = n.dependencies?.filter((id) => !deletedNodes.has(id));
      });

      // reset any dependants
      const dependants = Object.values(this.nodes).filter((n) => n.dependencies?.includes(rNode.id));
      dependants.forEach((n) => reset(n));
    };
    const node = this.nodes[nodeId];
    if (!node) throw new Error("Node not found");
    reset(node);
    this.emit("dataChanged");

    // prompt user if they wanna undo file writes
    if (fileWrites.length) {
      const selectedFiles = await this.projectContext.showRevertFilesDialog(
        fileWrites.map((w) => ({ path: w.path, original: w.original || "" })),
      );
      if (selectedFiles.length) {
        const fileWritesToUndo = fileWrites.filter((w) => selectedFiles.includes(w.path));
        for (const write of fileWritesToUndo) {
          if (write.created) {
            await this.deleteFile(write.path);
          } else {
            await this.writeFile(write.path, write.original || "");
          }
        }
        this.projectContext.displayToast(
          `Reverted ${fileWritesToUndo.length} file${fileWritesToUndo.length > 1 ? "s" : ""}`,
          { type: "success" },
        );
      }
    }
  }

  public async deleteNode(nodeId: string) {
    await this.resetNode(nodeId);
    Object.values(this.nodes).forEach((n) => {
      n.dependencies = n.dependencies?.filter((id) => id !== nodeId);
    });
    delete this.nodes[nodeId];
    this.emit("dataChanged");
  }

  public async iterate(prompt: string, iterationMode: IterationMode) {
    if (iterationMode === IterationMode.NEW_PLAN) {
      // todo this should target specific nodes, not just the first one it finds
      const planNode = Object.values(this.nodes).find(
        (n): n is NNode<typeof PlanNNode> => n.typeId === PlanNNode.typeId,
      );
      if (!planNode) throw new Error("Plan node not found");
      const executeNode = Object.values(this.nodes).find(
        (n): n is NNode<typeof ExecuteNNode> => n.typeId === ExecuteNNode.typeId,
      );
      if (!executeNode) throw new Error("Execute node not found");

      const newPlan = this.addNode(PlanNNode, { goal: prompt });
      this.addNode(
        ContextNNode,
        {
          contextId: PlanNNode_PrevIterationGoalContextId,
          context: createNodeRefFactory(planNode.id)({ path: "goal", type: "value", schema: "string" }),
        },
        newPlan.scope,
      );
      this.addNode(
        ContextNNode,
        {
          contextId: PlanNNode_PrevIterationChangeSetContextId,
          context: createNodeRefFactory(executeNode.id)({
            path: "result.rawChangeSet",
            type: "result",
            schema: "string",
          }),
        },
        newPlan.scope,
      );

      return;
    }

    // todo this should target specific nodes, not just the first one it finds
    const { node, oldGeneration, contextId } = match(iterationMode)
      .with(IterationMode.MODIFY_PLAN, () => {
        const planNode = Object.values(this.nodes).find(
          (n): n is NNode<typeof PlanNNode> => n.typeId === PlanNNode.typeId,
        );
        if (!planNode) throw new Error("Plan node not found");
        return {
          node: planNode,
          oldGeneration: planNode.state?.result?.result || "No plan generated",
          contextId: PlanNNode_ContextId,
        };
      })
      .with(IterationMode.MODIFY_CHANGE_SET, () => {
        const executeNode = Object.values(this.nodes).find(
          (n): n is NNode<typeof ExecuteNNode> => n.typeId === ExecuteNNode.typeId,
        );
        if (!executeNode) throw new Error("Execute node not found");
        return {
          node: executeNode,
          oldGeneration: executeNode?.state?.result?.result.rawChangeSet || "No change set generated",
          contextId: ExecuteNNode_ContextId,
        };
      })
      .exhaustive();

    const newContext = `
---------${new Date().toISOString()}---------
You previously generated the following:\n
<old_generation>
${oldGeneration}
</old_generation>
The user provided this feedback, please take it into account and try again:
<user_feedback>
${prompt}
</user_feedback>
      `.trim();

    let contextNode = findNode(node.scope, ContextNNode, (n) => n.value.contextId === contextId, this.nodes);
    if (contextNode) {
      await this.editNode(contextNode.id, (n) => {
        n.value.context += `\n\n${newContext}`;
      });
    } else {
      contextNode = this.addNode(ContextNNode, { contextId: contextId, context: newContext }, node?.scope);
      if (node) {
        (node.dependencies ||= []).push(contextNode.id);
        await this.resetNode(contextNode.id); // prepare for the next run
      }
    }
  }

  public getNodeDef<D extends NNodeDef>(node: NNode<D>) {
    const nodeDef = this.nodeDefs[node.typeId];
    if (!nodeDef) throw new Error(`Node type not found: ${node.typeId}`);
    return nodeDef as D;
  }

  public hasRealFileWrites() {
    return Object.values(this.nodes).some((node) => node.state?.trace?.some((t) => t.type === "write-file"));
  }

  public getActiveRunId() {
    return this.runId;
  }

  private addTrace(event: OmitUnion<GraphTraceEvent, "timestamp" | "runId">) {
    this.trace.push({ ...event, timestamp: Date.now(), runId: this.runId });
    console.log("[GraphRunner] Trace", event);
    this.emit("dataChanged"); // whenever there's a change, there should be a trace, so this effectively occurs on every change to the top level data
  }
  private addNodeTrace(node: NNode, event: OmitUnion<NNodeTraceEvent, "timestamp" | "runId">) {
    ((node.state ||= {}).trace ||= []).push({ ...event, timestamp: Date.now(), runId: this.runId });
    console.log("[GraphRunner] Node trace", node.value, event);
    this.emit("dataChanged"); // whenever there's a change, there should be a trace, so this effectively occurs on every change to the node data
  }

  public async reSaveAllWrites(): Promise<void> {
    const writeEvents = this.trace.flatMap((event) =>
      event.type === "end-node" && event.node.state?.trace
        ? event.node.state.trace.filter((t) => t.type === "write-file")
        : [],
    );

    for (const writeEvent of writeEvents) {
      try {
        await this.writeFile(writeEvent.path, writeEvent.content);
        console.log(`Re-saved file: ${writeEvent.path}`);
      } catch (error) {
        console.error(`Failed to re-save file ${writeEvent.path}:`, error);
        throw new Error(`Failed to re-save file ${writeEvent.path}: ${formatError(error)}`);
      }
    }
  }
}
export type GraphRunnerData = ReturnType<GraphRunner["toData"]>;

export function resolveNodeRef<T extends NNodeRefAccessorSchema>(
  ref: NNodeRef<T> | NNodeRefAccessorSchemaMap[T],
  nodeMap: Record<string, NNode>,
  accessedNodeIds?: Set<string>,
): NNodeRefAccessorSchemaMap[T] | undefined {
  if (!isNodeRef<T>(ref)) return ref;

  const node = nodeMap[ref.nodeId];
  if (!node) throw new Error(`Node for ref not found: ${ref.nodeId}`);
  if (accessedNodeIds) accessedNodeIds.add(node.id);

  const accessor = ref.accessor as NNodeRef<NNodeRefAccessorSchema>["accessor"];
  const val = get(
    match(accessor.type)
      .with("value", () => node.value)
      .with("result", () => node.state?.result)
      .exhaustive(),
    accessor.path,
  );

  if (val === undefined) return undefined;
  return NNodeRefAccessorSchemaMap[accessor.schema]!.parse(val) as NNodeRefAccessorSchemaMap[T];
}

export function resolveNodeValueRefs<T extends NNodeDef>(
  value: NNodeValue<T>,
  nodeMap: Record<string, NNode>,
  accessedNodeIds?: Set<string>,
): ResolveRefs<NNodeValue<T>> {
  const resolved = {} as ResolveRefs<NNodeValue<T>>;
  Object.entries(value).forEach(([key, val]) => {
    resolved[key as keyof NNodeValue<T>] = !isNodeRef(val)
      ? (val as NNodeValue<T>[keyof NNodeValue<T>])
      : resolveNodeRef<NNodeValue<T>[keyof NNodeValue<T>]>(val, nodeMap, accessedNodeIds) ??
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
  (nodeId: string): CreateNodeRef =>
  (accessor) => ({ sym: nnodeRefSymbol, nodeId, accessor });
