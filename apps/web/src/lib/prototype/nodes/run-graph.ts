import { EventEmitter } from "events";
import { cloneDeep, get, isEqual } from "lodash";
import { match } from "ts-pattern";
import zodToJsonSchema from "zod-to-json-schema";

import { newId } from "../../uid";
import { aiChat, openaiJson } from "../ai-chat";
import { asyncToArray, dirname, isDefined, OmitUnion } from "../utils";
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
      type: "read-file";
      path: string;
      result: Awaited<ReturnType<NodeRunnerContext["readFile"]>>;
      timestamp: number;
    }
  | {
      type: "write-file";
      path: string;
      content: string;
      timestamp: number;
    }
  | {
      type: "ai-chat";
      model: string;
      messages: { role: "user" | "assistant"; content: string }[];
      result: string;
      timestamp: number;
    }
  | {
      type: "ai-json";
      schema: unknown;
      input: string;
      result: unknown;
      timestamp: number;
    }
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
    addToRunStack: (node: NNode) => void,
  ): Promise<NNodeResult & { type: T }> {
    console.log(`[GraphRunner] Starting node: ${node.value.type}`);
    this.addTrace({ type: "start-node", node });

    const nodeRunnerContext: NodeRunnerContext = {
      projectContext: this.projectContext,
      addDependantNode: (newNodeValue) => {
        console.log(`[GraphRunner] Adding dependant node: ${newNodeValue.type}`);
        const newNode: NNode = {
          id: newId.graphNode(),
          value: newNodeValue,
          dependencies: [node.id],
        };
        this.nodes[newNode.id] = newNode;
        addToRunStack(newNode);
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
          console.log(`[GraphRunner] Found existing node: ${depNode.value.type}`);
          if (!depNode.state?.result) throw new Error("Node result not found"); // this shouldn't happen since deps are processed first
          existing = true;
          subResult = depNode.state.result; // todo should this add the node as a direct dependency?
        } else {
          console.log(`[GraphRunner] Adding dependency node: ${nodeValue.type}`);
          depNode = {
            id: newId.graphNode(),
            value: nodeValue,
            dependencies: inheritDependencies ? [...(node.dependencies || [])] : undefined,
          };
          (node.dependencies ||= []).push(depNode.id);
          this.nodes[depNode.id] = depNode;
          this.addNodeTrace(node, { type: "dependency", node: depNode });

          subResult = await this.startNode(depNode, addToRunStack);
        }

        console.log(`[GraphRunner] Dependency result: ${subResult}`);
        this.addNodeTrace(node, { type: "dependency-result", node: depNode, existing });

        return {
          ...(subResult as any),
          createNodeRef: (accessor) => ({ sym: nnodeRefSymbol, nodeId: depNode!.id, accessor }),
        };
      },
      createNodeRef: (accessor) => ({ sym: nnodeRefSymbol, nodeId: node.id, accessor }),
      resolveNodeRef: this.resolveNodeRef.bind(this),

      readFile: async (path) => {
        console.log(`[GraphRunner] Read file: ${path}`);

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
        console.log(`[GraphRunner] Write file: ${path}`);
        const dir = dirname(path);
        const name = path.split("/").at(-1)!;
        const dirHandle = await this.getFileHandle(dir, undefined, true);
        if (dirHandle?.kind !== "directory") throw new Error(`Directory not found: ${dir}`);
        const fileHandle = await dirHandle.getFileHandle(name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();

        this.addNodeTrace(node, { type: "write-file", path, content });
      },
      aiChat: async (model, messages) => {
        try {
          const result = await aiChat(model, this.projectContext.systemPrompt, messages);
          console.log(`[GraphRunner] AI chat result: ${result}`);
          this.addNodeTrace(node, { type: "ai-chat", model, messages, result });
          return result;
        } catch (e) {
          console.error(e);
          console.error(JSON.stringify(e, null, 2));
          throw e;
        }
      },
      aiJson: async (schema, input) => {
        const result = await openaiJson(schema, this.projectContext.systemPrompt, input);
        console.log(`[GraphRunner] AI JSON result: ${result}`);
        this.addNodeTrace(node, {
          type: "ai-json",
          schema: zodToJsonSchema(schema, "S").definitions?.S,
          input,
          result,
        });
        return result;
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
    console.log(`[GraphRunner] Node completed: ${node.value.type}`);
    return result;
  }

  public async run() {
    if ((await this.projectContext.folderHandle.queryPermission({ mode: "readwrite" })) !== "granted") {
      if ((await this.projectContext.folderHandle.requestPermission({ mode: "readwrite" })) !== "granted") {
        throw new Error("Permission denied");
      }
    }

    const runStack = Object.values(this.nodes);
    this.addTrace({ type: "start" });
    // run the graph, keep consuming nodes until all nodes are completed
    while (runStack.length > 0) {
      const node = runStack.pop()!;
      if (node.state?.startedAt) continue;
      if (node.dependencies?.some((id) => !this.nodes[id]?.state?.completedAt)) {
        runStack.unshift(node); // todo do this better
        continue;
      }
      await this.startNode(node, (newNode) => runStack.push(newNode));
    }
    this.addTrace({ type: "end" });
  }

  public toData() {
    return { nodes: { ...this.nodes }, trace: [...this.trace] };
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
      return resolveNodeRefAccessor<T>(ref as NNodeRef<T>, this.nodes[ref.nodeId]!);
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

export function resolveNodeRefAccessor<T extends NNodeRefAccessorSchema>(
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
