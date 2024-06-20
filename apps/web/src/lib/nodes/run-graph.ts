import { EventEmitter } from "events";
import { produce } from "immer";
import cloneDeep from "lodash/cloneDeep";
import get from "lodash/get";
import isEqual from "lodash/isEqual";
import uniq from "lodash/uniq";
import { match } from "ts-pattern";
import zodToJsonSchema from "zod-to-json-schema";

import { isDefined, IterationMode, OmitUnion } from "@repo/shared";

import { formatError, throwError } from "../err";
import { newId } from "../uid";
import { ApplyFileChangesNNode } from "./defs/ApplyFileChangesNNode";
import { ContextNNode } from "./defs/ContextNNode";
import { ExecuteNNode, ExecuteNNode_ContextId } from "./defs/ExecuteNNode";
import { OutputNNode } from "./defs/OutputNNode";
import { PlanNNode, PlanNNode_ContextId } from "./defs/PlanNNode";
import { ProjectAnalysisNNode } from "./defs/ProjectAnalysisNNode";
import { RelevantFileAnalysisNNode } from "./defs/RelevantFileAnalysisNNode";
import { TypescriptDepAnalysisNNode } from "./defs/TypescriptDepAnalysisNNode";
import { aiChat, aiJson } from "./ai-chat";
import { NNodeDef, NNodeResult, NNodeValue, NodeRunnerContext, ProjectContext } from "./node-types";
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
      dryRun?: boolean;
      timestamp: number;
      runId: string;
    }
  | {
      type: "ai-chat-request";
      chatId: string;
      model: string;
      messages: { role: "user" | "assistant"; content: string }[];
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
      timestamp: number;
      runId: string;
    }
  | { type: "ai-json-response"; chatId: string; result: unknown; timestamp: number; runId: string }
  | { type: "error"; message: string; error: unknown; timestamp: number; runId: string }
  | { type: "result"; result: NNodeResult<NNodeDef>; timestamp: number; runId: string };

export interface NNode<D extends NNodeDef = NNodeDef> {
  id: string;

  typeId: D["typeId"];
  value: NNodeValue<D>;

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

function findNode<D extends NNodeDef>(
  nodes: NNode[],
  def: D,
  filter: (node: NNode) => boolean,
  nodeMap: Record<string, NNode<D>>, // used to look up nodes by node ids
): NNode<D> | undefined {
  const directDep = nodes.find((n): n is NNode<D> => n.typeId === def.typeId && filter(n));
  if (directDep) return directDep;
  for (const node of nodes) {
    const found = findNode((node.dependencies || []).map((id) => nodeMap[id]).filter(isDefined), def, filter, nodeMap);
    if (found) return found;
  }
  return undefined;
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
  };
  private runId = "";

  private constructor(private projectContext: ProjectContext) {
    super();
  }

  public static fromGoal(projectContext: ProjectContext, goal: string) {
    const graphRunner = new GraphRunner(projectContext);
    graphRunner.addNode(PlanNNode, { goal });
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
    queueNode: (node: NNode) => void,
    waitForNode: <D2 extends NNodeDef>(node: NNode<D2>) => Promise<NNodeResult<D2>>,
  ): Promise<NNodeResult<D>> {
    console.log("[GraphRunner] Starting node", node.value);
    this.addTrace({ type: "start-node", node });

    const nodeRunnerContext: NodeRunnerContext = {
      projectContext: this.projectContext,
      addDependantNode: (newNodeDef, newNodeValue) => {
        console.log("[GraphRunner] Adding dependant node", newNodeValue);
        const newNode = this.addNode(newNodeDef, newNodeValue, [node.id]);
        ((node.state ||= {}).createdNodes ||= []).push(newNode.id);
        queueNode(newNode);
        this.addNodeTrace(node, { type: "dependant", node: newNode });
      },
      getOrAddDependencyForResult: async (nodeDef, nodeValue, inheritDependencies) => {
        let depNode = findNode(
          (node.dependencies || []).map((id) => this.nodes[id]).filter(isDefined),
          nodeDef,
          (n) => isEqual(n.value, nodeValue),
          this.nodes,
        );
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
          depNode = this.addNode(nodeDef, nodeValue, inheritDependencies ? [...(node.dependencies || [])] : undefined);
          (node.dependencies ||= []).push(depNode.id);
          ((node.state ||= {}).createdNodes ||= []).push(depNode.id);
          this.addNodeTrace(node, { type: "dependency", node: depNode });

          subResult = await waitForNode(depNode);
        }

        console.log("[GraphRunner] Dependency result", subResult);
        this.addNodeTrace(node, { type: "dependency-result", node: depNode, existing, result: subResult });

        const createNodeRef: CreateNodeRef = (accessor) => ({ sym: nnodeRefSymbol, nodeId: depNode.id, accessor });
        return { ...subResult, createNodeRef };
      },
      findNodeForResult: async (nodeDef, filter) => {
        // prefer deps, then search whole graph
        const foundNode =
          findNode(
            (node.dependencies || []).map((id) => this.nodes[id]).filter(isDefined),
            nodeDef,
            (n) => filter(n.value),
            this.nodes,
          ) || Object.values(this.nodes).find((n) => n.typeId === nodeDef.typeId && filter(n.value));
        if (!foundNode) return null;

        node.dependencies = uniq([...(node.dependencies || []), foundNode.id]);
        const result = foundNode.state?.result || (await waitForNode(foundNode));

        this.addNodeTrace(node, { type: "find-node", node: foundNode, result });
        return result;
      },
      createNodeRef: (accessor) => ({ sym: nnodeRefSymbol, nodeId: node.id, accessor }),

      readFile: async (path) => {
        console.log("[GraphRunner] Read file", path);

        const result = await this.projectContext.readFile(path);
        this.addNodeTrace(node, { type: "read-file", path, result });
        return result;
      },
      writeFile: async (path, content) => {
        if (this.projectContext.dryRun) {
          console.log(`[Dry Run] Skipping write operation for: ${path}`);
          this.addNodeTrace(node, { type: "write-file", path, content, dryRun: true });
          return;
        }

        const original = await this.writeFile(path, content);
        this.addNodeTrace(node, { type: "write-file", path, content, original });
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
          const result = await aiChat(this.projectContext, model, this.projectContext.systemPrompt, messages);
          console.log("[GraphRunner] AI chat result", result);
          this.addNodeTrace(node, { type: "ai-chat-response", chatId: traceId, result });
          return result;
        } catch (e) {
          console.error(e);
          console.error(JSON.stringify(e, null, 2));
          throw e;
        }
      },
      aiJson: async (schema, input) => {
        try {
          const traceId = newId.traceChat();
          this.addNodeTrace(node, {
            type: "ai-json-request",
            chatId: traceId,
            schema: zodToJsonSchema(schema, "S").definitions?.S,
            input,
          });
          const result = await aiJson(this.projectContext, "gpt4o", schema, input);
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

  public async run() {
    this.runId = newId.graphRun();
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
          nodePromises.set(
            node.id,
            (async () => {
              try {
                return await this.startNode(node, (newNode) => runStack.push(newNode), startNodeWrapped as any);
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
        await Promise.all(runnableNodes.map(startNodeWrapped));
      }
      // todo clean up any outstanding promises with rejects
    } finally {
      this.addTrace({ type: "end" });
      this.runId = "";
    }
  }

  public toData() {
    return { nodes: { ...this.nodes }, trace: [...this.trace] };
  }

  public isNodeRunnable(node: NNode) {
    return (
      !node.state?.startedAt &&
      !node.state?.completedAt &&
      !node.dependencies?.some((id) => !this.nodes[id]?.state?.completedAt)
    );
  }

  public async writeFile(path: string, content: string) {
    console.log("[GraphRunner] Write file", path);
    return this.projectContext.writeFile(path, content);
  }

  public addNode<D extends NNodeDef>(nodeDef: D, nodeValue: NNodeValue<D>, dependencies?: string[]) {
    const node: NNode<D> = { id: newId.graphNode(), typeId: nodeDef.typeId, value: nodeValue, dependencies };
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
            (t): t is NNodeTraceEvent & { type: "write-file" } => t.type === "write-file",
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
          await this.writeFile(write.path, write.original || "");
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
    const { node, oldGeneration, contextId } = match(iterationMode)
      .with(IterationMode.MODIFY_PLAN, () => {
        const planNode = Object.values(this.nodes).find(
          (n): n is NNode<typeof PlanNNode> => n.typeId === PlanNNode.typeId,
        );
        return {
          node: planNode,
          oldGeneration: planNode?.state?.result?.result || "No plan generated",
          contextId: PlanNNode_ContextId,
        };
      })
      .with(IterationMode.MODIFY_CHANGE_SET, () => {
        const executeNode = Object.values(this.nodes).find(
          (n): n is NNode<typeof ExecuteNNode> => n.typeId === ExecuteNNode.typeId,
        );
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

    let contextNode = Object.values(this.nodes).find(
      (n): n is NNode<typeof ContextNNode> => n.typeId === ContextNNode.typeId && n.value.contextId === contextId,
    );
    if (contextNode) {
      await this.editNode(contextNode.id, (n) => {
        n.value.context += `\n\n${newContext}`;
      });
    } else {
      contextNode = this.addNode(ContextNNode, { contextId: contextId, context: newContext });
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
    resolved[key as keyof NNodeValue<T>] =
      resolveNodeRef<NNodeValue<T>[keyof NNodeValue<T>]>(val, nodeMap, accessedNodeIds) ??
      throwError(`Node ref not resolved: ${key}`);
  });
  return resolved;
}
