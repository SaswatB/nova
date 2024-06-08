import { asyncToArray, dirname, isDefined, OmitUnion } from "@repo/shared";
import { EventEmitter } from "events";
import * as idb from "idb-keyval";
import { cloneDeep, get, isEqual } from "lodash";
import { match } from "ts-pattern";
import zodToJsonSchema from "zod-to-json-schema";

import { newId } from "../uid";
import { aiChat, aiJson } from "./ai-chat";
import { NNodeResult, NNodeType, NNodeValue, NodeRunnerContext, ProjectContext } from "./node-types";
import {
  isNodeRef,
  NNodeRef,
  NNodeRefAccessorSchema,
  NNodeRefAccessorSchemaMap,
  nnodeRefSymbol,
  ResolveRefs,
} from "./ref-types";
import { runNode } from "./run-node";

export type GraphTraceEvent =
  | { type: "start"; timestamp: number }
  | { type: "start-node"; node: NNode; timestamp: number }
  | { type: "end-node"; node: NNode; timestamp: number }
  | { type: "end"; timestamp: number };
export type NNodeTraceEvent =
  | { type: "start"; resolvedValue: ResolveRefs<NNodeValue>; timestamp: number }
  | {
      type: "dependency" | "dependency-result";
      node: NNode;
      timestamp: number;
      existing?: boolean;
    }
  | { type: "dependant"; node: NNode; timestamp: number }
  | {
      type: "get-cache";
      key: string;
      result: unknown;
      timestamp: number;
    }
  | {
      type: "set-cache";
      key: string;
      value: unknown;
      timestamp: number;
    }
  | {
      type: "read-file";
      path: string;
      result: Awaited<ReturnType<NodeRunnerContext["readFile"]>>;
      timestamp: number;
    }
  | {
      type: "write-file";
      path: string;
      content: string;
      dryRun?: boolean;
      timestamp: number;
    }
  | {
      type: "ai-chat-request";
      chatId: string;
      model: string;
      messages: { role: "user" | "assistant"; content: string }[];
      timestamp: number;
    }
  | {
      type: "ai-chat-response";
      chatId: string;
      result: string;
      timestamp: number;
    }
  | {
      type: "ai-json-request";
      chatId: string;
      schema: unknown;
      input: string;
      timestamp: number;
    }
  | { type: "ai-json-response"; chatId: string; result: unknown; timestamp: number }
  | { type: "result"; result: NNodeResult; timestamp: number };

export interface NNode {
  id: string;
  dependencies?: string[]; // node ids
  value: NNodeValue;

  state?: {
    startedAt?: number;
    completedAt?: number;
    result?: NNodeResult;
    trace?: NNodeTraceEvent[];
    createdNodes?: string[]; // node ids
  };
}

function findNodeByValue(nodes: NNode[], value: NNodeValue, nodeMap: Record<string, NNode>): NNode | undefined {
  const directDep = nodes.find((n) => isEqual(n.value, value));
  if (directDep) return directDep;
  for (const node of nodes) {
    const found = findNodeByValue((node.dependencies || []).map((id) => nodeMap[id]).filter(isDefined), value, nodeMap);
    if (found) return found;
  }
  return undefined;
}

export class GraphRunner extends EventEmitter<{ dataChanged: [] }> {
  private nodes: Record<string, NNode> = {}; // id -> node
  private trace: GraphTraceEvent[] = [];

  private constructor(private projectContext: ProjectContext) {
    super();
  }

  public static fromGoal(projectContext: ProjectContext, goal: string) {
    const graphRunner = new GraphRunner(projectContext);
    const id = newId.graphNode();
    graphRunner.nodes = { [id]: { id, value: { type: NNodeType.Plan, goal } } };
    return graphRunner;
  }

  public static fromData(projectContext: ProjectContext, data: GraphRunnerData) {
    const graphRunner = new GraphRunner(projectContext);
    graphRunner.nodes = cloneDeep(data.nodes);
    graphRunner.trace = [...data.trace];
    return graphRunner;
  }

  private async startNode<T extends NNodeType>(
    node: NNode & { value: { type: T } },
    queueNode: (node: NNode) => void,
    startNode: <U extends NNodeType>(node: NNode & { value: { type: U } }) => Promise<NNodeResult & { type: U }>,
  ): Promise<NNodeResult & { type: T }> {
    console.log("[GraphRunner] Starting node", node.value);
    this.addTrace({ type: "start-node", node });

    const nodeRunnerContext: NodeRunnerContext = {
      projectContext: this.projectContext,
      addDependantNode: (newNodeValue) => {
        console.log("[GraphRunner] Adding dependant node", newNodeValue);
        const newNode: NNode = { id: newId.graphNode(), value: newNodeValue, dependencies: [node.id] };
        this.nodes[newNode.id] = newNode;
        ((node.state ||= {}).createdNodes ||= []).push(newNode.id);
        queueNode(newNode);
        this.addNodeTrace(node, { type: "dependant", node: newNode });
      },
      getOrAddDependencyForResult: async (nodeValue, inheritDependencies) => {
        let depNode = findNodeByValue(
          (node.dependencies || []).map((id) => this.nodes[id]).filter(isDefined),
          nodeValue,
          this.nodes,
        );
        let subResult;
        let existing = undefined;
        if (depNode) {
          console.log("[GraphRunner] Found existing node", depNode.value);
          if (!depNode.state?.result) throw new Error("Node result not found"); // this shouldn't happen since deps are processed first
          existing = true;
          subResult = depNode.state.result; // todo should this add the node as a direct dependency?
        } else {
          console.log("[GraphRunner] Adding dependency node", nodeValue);
          depNode = {
            id: newId.graphNode(),
            value: nodeValue,
            dependencies: inheritDependencies ? [...(node.dependencies || [])] : undefined,
          };
          (node.dependencies ||= []).push(depNode.id);
          this.nodes[depNode.id] = depNode;
          ((node.state ||= {}).createdNodes ||= []).push(depNode.id);
          this.addNodeTrace(node, { type: "dependency", node: depNode });

          subResult = await startNode(depNode);
        }

        console.log("[GraphRunner] Dependency result", subResult);
        this.addNodeTrace(node, { type: "dependency-result", node: depNode, existing });

        return {
          ...(subResult as any),
          createNodeRef: (accessor) => ({ sym: nnodeRefSymbol, nodeId: depNode!.id, accessor }),
        };
      },
      createNodeRef: (accessor) => ({ sym: nnodeRefSymbol, nodeId: node.id, accessor }),
      resolveNodeRef: this.resolveNodeRef.bind(this),

      readFile: async (path) => {
        console.log("[GraphRunner] Read file", path);

        const handle = await this.getFileHandle(path);
        let result: Awaited<ReturnType<NodeRunnerContext["readFile"]>>;
        if (!handle) {
          return { type: "not-found" };
        } else if (handle.kind === "file") {
          result = { type: "file", content: await (await handle.getFile()).text() };
        } else {
          result = { type: "directory", files: await asyncToArray(handle.keys()) };
        }
        this.addNodeTrace(node, { type: "read-file", path, result });
        return result;
      },
      writeFile: async (path, content) => {
        if (this.projectContext.dryRun) {
          console.log(`[Dry Run] Skipping write operation for: ${path}`);
          this.addNodeTrace(node, { type: "write-file", path, content, dryRun: true });
          return;
        }

        await this.writeFile(path, content);
        this.addNodeTrace(node, { type: "write-file", path, content });
      },

      getCache: async (key, schema) => {
        const res = schema.safeParse(await idb.get(`project-${this.projectContext.projectId}:graph-cache:${key}`));
        if (res.success) {
          this.addNodeTrace(node, { type: "get-cache", key, result: res.data });
          return res.data;
        }
        return undefined;
      },
      setCache: async (key, value) => {
        this.addNodeTrace(node, { type: "set-cache", key, value });
        return idb.set(`project-${this.projectContext.projectId}:graph-cache:${key}`, value);
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
          const result = await aiJson(this.projectContext, "gpt4o", schema, this.projectContext.systemPrompt, input);
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
    };

    const nodeResolvedValue = this.resolveNodeValueRefs(node.value); // resolve refs in input

    (node.state ||= {}).startedAt = Date.now();
    this.addNodeTrace(node, { type: "start", resolvedValue: nodeResolvedValue });

    // todo error handling
    const result = await runNode<T>(nodeResolvedValue, nodeRunnerContext);

    node.state.completedAt = Date.now();
    node.state.result = result;
    this.addNodeTrace(node, { type: "result", result });

    this.addTrace({ type: "end-node", node });
    console.log("[GraphRunner] Node completed", node.value);
    return result;
  }

  public async run() {
    if ((await this.projectContext.folderHandle.queryPermission({ mode: "readwrite" })) !== "granted") {
      if ((await this.projectContext.folderHandle.requestPermission({ mode: "readwrite" })) !== "granted") {
        throw new Error("Permission denied");
      }
    }

    const runStack = Object.values(this.nodes).filter((node) => !node.state?.completedAt);
    runStack.forEach((node) => {
      if (node.state?.startedAt && !node.state.completedAt) {
        console.warn("[GraphRunner] Node started but not completed, clearing state", node.value);
        delete node.state;
      }
    });
    const nodePromises = new Map<string, Promise<NNodeResult>>();

    const startNodeWrapped = (node: NNode): Promise<NNodeResult> => {
      if (!nodePromises.has(node.id)) {
        nodePromises.set(
          node.id,
          this.startNode(node, (newNode) => runStack.push(newNode), startNodeWrapped as any),
        );
      }
      return nodePromises.get(node.id)!;
    };

    this.addTrace({ type: "start" });
    // run the graph, keep consuming nodes until all nodes are completed
    while (runStack.length > 0) {
      const runnableNodes = runStack.filter(
        (node) =>
          !node.state?.startedAt &&
          !node.state?.completedAt &&
          !node.dependencies?.some((id) => !this.nodes[id]?.state?.completedAt),
      );
      if (runnableNodes.length === 0) {
        console.log("[GraphRunner] No runnable nodes", runStack);
        throw new Error("No runnable nodes");
      }
      runnableNodes.forEach((node) => runStack.splice(runStack.indexOf(node), 1));

      // run all runnable nodes in parallel
      await Promise.all(runnableNodes.map(startNodeWrapped));
    }
    // todo clean up any outstanding promises with rejects
    this.addTrace({ type: "end" });
  }

  public toData() {
    return { nodes: { ...this.nodes }, trace: [...this.trace] };
  }

  public async writeFile(path: string, content: string) {
    console.log("[GraphRunner] Write file", path);
    const dir = dirname(path);
    const name = path.split("/").at(-1)!;
    const dirHandle = await this.getFileHandle(dir, undefined, true);
    if (dirHandle?.kind !== "directory") throw new Error(`Directory not found: ${dir}`);
    const fileHandle = await dirHandle.getFileHandle(name, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }

  public async resetNode(nodeId: string) {
    const node = this.nodes[nodeId];
    if (!node) throw new Error("Node not found");

    // delete all nodes created as a side effect of the node
    const deletedNodes = new Set<string>();
    const deleteNode = (subNodeId: string) => {
      if (deletedNodes.has(subNodeId)) return;
      deletedNodes.add(subNodeId);

      this.nodes[subNodeId]?.state?.createdNodes?.forEach((id) => deleteNode(id));
      delete this.nodes[subNodeId];
    };
    node.state?.createdNodes?.forEach((id) => deleteNode(id));

    // clear node state
    delete node.state;

    // remove deleted nodes from other nodes' dependencies
    Object.values(this.nodes).forEach((n) => {
      n.dependencies = n.dependencies?.filter((id) => !deletedNodes.has(id));
    });
    this.emit("dataChanged");
  }

  private addTrace(event: OmitUnion<(typeof GraphRunner.prototype.trace)[number], "timestamp">) {
    this.trace.push({ ...event, timestamp: Date.now() });
    this.emit("dataChanged"); // whenever there's a change, there should be a trace, so this effectively occurs on every change to the top level data
  }
  private addNodeTrace(
    node: NNode,
    event: OmitUnion<Exclude<Exclude<NNode["state"], undefined>["trace"], undefined>[number], "timestamp">,
  ) {
    ((node.state ||= {}).trace ||= []).push({ ...event, timestamp: Date.now() });
    this.emit("dataChanged"); // whenever there's a change, there should be a trace, so this effectively occurs on every change to the node data
  }

  private async getFileHandle(path: string, root = this.projectContext.folderHandle, createAsDirectory = false) {
    const parts = path.split("/");
    if (parts[0] === "") parts.shift(); // remove leading slash
    if (parts.at(-1) === "") parts.pop(); // remove trailing slash
    if (parts.length === 0) return root;

    let folder = root;
    const breadcrumbs: string[] = [];

    while (parts.length > 0) {
      const part = parts.shift()!;
      breadcrumbs.push(part);
      let found = false;
      for await (const [name, handle] of folder.entries()) {
        if (name !== part) continue;
        if (parts.length === 0) return handle; // found target
        if (handle.kind !== "directory") throw new Error(`Expected directory, found file: ${breadcrumbs.join("/")}`);
        // found intermediate directory
        folder = handle;
        found = true;
        break;
      }
      if (!found) {
        if (createAsDirectory) {
          folder = await folder.getDirectoryHandle(part, { create: true });
          if (parts.length === 0) return folder;
        } else {
          return null;
        }
      }
    }

    return null;
  }

  private resolveNodeRef<T extends NNodeRefAccessorSchema>(
    ref: NNodeRef<T> | NNodeRefAccessorSchemaMap[T],
  ): NNodeRefAccessorSchemaMap[T] {
    if (isNodeRef(ref)) {
      return resolveNodeRef<T>(ref as NNodeRef<T>, this.nodes[ref.nodeId]!);
    }
    return ref as NNodeRefAccessorSchemaMap[T];
  }
  private resolveNodeValueRefs<T extends NNodeValue>(value: T): ResolveRefs<T> {
    const resolved: any = { ...value };
    Object.entries(value).forEach(([key, val]) => {
      if (isNodeRef(val)) resolved[key as keyof T] = this.resolveNodeRef(val);
    });
    return resolved;
  }
}
export type GraphRunnerData = ReturnType<GraphRunner["toData"]>;

export function resolveNodeRef<T extends NNodeRefAccessorSchema>(
  ref: NNodeRef<T>,
  node: NNode,
): NNodeRefAccessorSchemaMap[T] {
  const accessor = ref.accessor as NNodeRef<NNodeRefAccessorSchema>["accessor"];
  const val = get(
    match(accessor.type)
      .with("value", () => node.value)
      .with("result", () => node.state?.result)
      .exhaustive(),
    accessor.path,
  );
  return NNodeRefAccessorSchemaMap[accessor.schema]!.parse(val) as any;
}

export function resolveNodeRefOrValue<T extends NNodeRefAccessorSchema>(
  v: NNodeRef<T> | NNodeRefAccessorSchemaMap[T],
  graphData: GraphRunnerData,
): NNodeRefAccessorSchemaMap[T] | null {
  if (isNodeRef(v)) {
    const refNode = graphData.nodes[v.nodeId];
    return refNode ? (resolveNodeRef(v, refNode) as NNodeRefAccessorSchemaMap[T]) : null;
  }
  return v as NNodeRefAccessorSchemaMap[T];
}
