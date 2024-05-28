import { EventEmitter } from "events";
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { isEqual } from "lodash";
import { dirname } from "path";
import { inspect } from "util";
import { z } from "zod";

import { aiChat, openaiJson } from "../ai-chat";
import { OmitUnion } from "../utils";
import { NNodeResult, NNodeType, NNodeValue, NodeRunnerContext, ProjectContext } from "./node-types";
import { runNode } from "./run-node";

interface NNode {
  id: string;
  dependencies?: NNode[];
  value: NNodeValue;

  state?: {
    startedAt?: number;
    completedAt?: number;
    result?: NNodeResult;
    trace?: (
      | { type: "start"; timestamp: number }
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
          schema: z.Schema<unknown>;
          input: string;
          result: unknown;
          timestamp: number;
        }
      | { type: "result"; result: NNodeResult; timestamp: number }
    )[];
  };
}

function findNodeByValue(nodes: NNode[], value: NNodeValue): NNode | undefined {
  const directDep = nodes.find((n) => isEqual(n.value, value));
  if (directDep) return directDep;
  for (const node of nodes) {
    const found = findNodeByValue(node.dependencies || [], value);
    if (found) return found;
  }
  return undefined;
}

export class GraphRunner extends EventEmitter<{ dataChanged: [] }> {
  private nodes: NNode[] = [];
  private trace: (
    | { type: "start"; timestamp: number }
    | { type: "start-node"; node: NNode; timestamp: number }
    | { type: "end-node"; node: NNode; timestamp: number }
    | { type: "end"; timestamp: number }
  )[] = [];

  private constructor(private projectContext: ProjectContext) {
    super();
  }

  public static fromGoal(projectContext: ProjectContext, goal: string) {
    const graphRunner = new GraphRunner(projectContext);
    graphRunner.nodes = [{ id: "plan", value: { type: NNodeType.Plan, goal } }];
    return graphRunner;
  }

  public static fromData(projectContext: ProjectContext, data: GraphRunnerData) {
    const graphRunner = new GraphRunner(projectContext);
    graphRunner.nodes = data.nodes;
    graphRunner.trace = data.trace;
  }

  private async startNode<T extends NNodeType>(
    node: NNode & { value: { type: T } },
    addToRunStack: (node: NNode) => void,
  ): Promise<NNodeResult & { type: T }> {
    console.log(`[GraphRunner] Starting node: ${node.value.type}`);

    (node.state ||= {}).startedAt = Date.now();
    this.addTrace({ type: "start-node", node });
    this.addNodeTrace(node, { type: "start" });

    const nodeRunnerContext: NodeRunnerContext = {
      projectContext: this.projectContext,
      addDependantNode: (newNodeValue) => {
        console.log(`[GraphRunner] Adding dependant node: ${newNodeValue.type}`);
        const newNode = {
          id: `${node.value.type}${this.nodes.length}`,
          value: newNodeValue,
          dependencies: [node],
        };
        this.nodes.push(newNode);
        addToRunStack(newNode);
        this.addNodeTrace(node, { type: "dependant", node: newNode });
      },
      getOrAddDependencyForResult: async (nodeValue, inheritDependencies) => {
        const existing = findNodeByValue(node.dependencies || [], nodeValue);
        if (existing) {
          console.log(`[GraphRunner] Found existing node: ${existing.value.type}`);
          if (!existing.state?.result) throw new Error("Node result not found"); // this shouldn't happen since deps are processed first
          this.addNodeTrace(node, { type: "dependency-result", node: existing, existing: true });
          return existing.state.result as any; // todo should this add the node as a direct dependency?
        }
        console.log(`[GraphRunner] Adding dependency node: ${nodeValue.type}`);
        const newNode = {
          id: `${node.value.type}${this.nodes.length}`,
          value: nodeValue,
          dependencies: inheritDependencies ? [...(node.dependencies || [])] : undefined,
        };
        (node.dependencies ||= []).push(newNode);
        this.nodes.push(newNode);
        this.addNodeTrace(node, { type: "dependency", node: newNode });

        const subResult = await this.startNode(newNode as any, addToRunStack);
        console.log(`[GraphRunner] Dependency result: ${subResult}`);
        this.addNodeTrace(node, { type: "dependency-result", node: newNode });
        return subResult;
      },
      readFile: async (path) => {
        console.log(`[GraphRunner] Read file: ${path}`);
        let result: Awaited<ReturnType<NodeRunnerContext["readFile"]>>;
        if (!existsSync(path)) result = { type: "not-found" };
        else if (statSync(path).isDirectory()) result = { type: "directory", files: readdirSync(path) };
        else result = { type: "file", content: readFileSync(path, "utf-8") };

        this.addNodeTrace(node, { type: "read-file", path, result });
        return result;
      },
      writeFile: async (path, content) => {
        console.log(`[GraphRunner] Write file: ${path}`);
        const dir = dirname(path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(path, content);

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
        this.addNodeTrace(node, { type: "ai-json", schema, input, result });
        return result;
      },
    };
    // todo error handling
    const result = await runNode<T>(node.value, nodeRunnerContext);
    node.state.completedAt = Date.now();
    node.state.result = result;
    this.addNodeTrace(node, { type: "result", result });
    this.addTrace({ type: "end-node", node });

    return result;
  }

  public async run() {
    const runStack = [...this.nodes];
    this.addTrace({ type: "start" });
    // run the graph, keep consuming nodes until all nodes are completed
    while (runStack.length > 0) {
      const node = runStack.pop()!;
      if (node.state?.startedAt) continue;
      if (node.dependencies?.some((dep) => !dep.state?.completedAt)) {
        runStack.unshift(node); // todo do this better
        continue;
      }
      await this.startNode(node, (newNode) => runStack.push(newNode));
    }
    this.addTrace({ type: "end" });

    writeFileSync("graph.json", inspect({ nodes: this.nodes, trace: this.trace }, { depth: 20 }));
  }

  public toData() {
    return { nodes: this.nodes, trace: this.trace };
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
}
export type GraphRunnerData = ReturnType<GraphRunner["toData"]>;
