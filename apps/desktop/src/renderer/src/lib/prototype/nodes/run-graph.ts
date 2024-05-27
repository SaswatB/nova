import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { isEqual } from "lodash";
import { dirname } from "path";
import { z } from "zod";

import { aiChat, openaiJson } from "../ai-chat";
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

class GraphRunner {
  private nodes: NNode[];
  private trace: (
    | { type: "start"; timestamp: number }
    | { type: "start-node"; node: NNode; timestamp: number }
    | { type: "end-node"; node: NNode; timestamp: number }
    | { type: "end"; timestamp: number }
  )[] = [];
  private runStack: NNode[];

  public constructor(
    private projectContext: ProjectContext,
    goal: string,
  ) {
    this.nodes = [{ id: "plan", value: { type: NNodeType.Plan, goal } }];
    this.runStack = [...this.nodes];
  }

  private async startNode<T extends NNodeType>(
    node: NNode & { value: { type: T } },
  ): Promise<NNodeResult & { type: T }> {
    this.trace.push({ type: "start-node", node, timestamp: Date.now() });
    console.log(`[GraphRunner] Starting node: ${node.value.type}`);

    (node.state = node.state || {}).startedAt = Date.now();
    node.state.trace = node.state.trace || [];
    node.state.trace.push({ type: "start", timestamp: Date.now() });

    const nodeRunnerContext: NodeRunnerContext = {
      projectContext: this.projectContext,
      addDependantNode: (newNodeValue) => {
        const newNode = {
          id: `${node.value.type}${this.nodes.length}`,
          value: newNodeValue,
          dependencies: [node],
        };
        console.log(`[GraphRunner] Adding dependant node: ${newNode.value.type}`);
        node.state!.trace!.push({ type: "dependant", node: newNode, timestamp: Date.now() });
        this.nodes.push(newNode);
        this.runStack.push(newNode);
      },
      getOrAddDependencyForResult: async (nodeValue, inheritDependencies) => {
        const existing = findNodeByValue(node.dependencies || [], nodeValue);
        if (existing) {
          console.log(`[GraphRunner] Found existing node: ${existing.value.type}`);
          node.state!.trace!.push({ type: "dependency-result", node: existing, existing: true, timestamp: Date.now() });
          if (!existing.state?.result) throw new Error("Node result not found"); // this shouldn't happen since deps are processed first
          return existing.state.result as any; // todo should this add the node as a direct dependency?
        }
        const newNode = {
          id: `${node.value.type}${this.nodes.length}`,
          value: nodeValue,
          dependencies: inheritDependencies ? [...(node.dependencies || [])] : undefined,
        };
        console.log(`[GraphRunner] Adding dependency node: ${newNode.value.type}`);
        node.state!.trace!.push({ type: "dependency", node: newNode, timestamp: Date.now() });
        node.dependencies = node.dependencies || [];
        node.dependencies.push(newNode);
        this.nodes.push(newNode);
        const subResult = await this.startNode(newNode as any);
        console.log(`[GraphRunner] Dependency result: ${subResult}`);
        node.state!.trace!.push({ type: "dependency-result", node: newNode, timestamp: Date.now() });
        return subResult;
      },
      readFile: async (path) => {
        let result: Awaited<ReturnType<NodeRunnerContext["readFile"]>>;
        if (!existsSync(path)) result = { type: "not-found" };
        else if (statSync(path).isDirectory()) result = { type: "directory", files: readdirSync(path) };
        else result = { type: "file", content: readFileSync(path, "utf-8") };
        console.log(`[GraphRunner] Read file: ${path}`);
        node.state!.trace!.push({ type: "read-file", path, result, timestamp: Date.now() });
        return result;
      },
      writeFile: async (path, content) => {
        console.log(`[GraphRunner] Write file: ${path}`);
        node.state!.trace!.push({ type: "write-file", path, content, timestamp: Date.now() });
        const dir = dirname(path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(path, content);
      },
      aiChat: async (model, messages) => {
        try {
          const result = await aiChat(model, this.projectContext.systemPrompt, messages);
          console.log(`[GraphRunner] AI chat result: ${result}`);
          node.state!.trace!.push({ type: "ai-chat", model, messages, result, timestamp: Date.now() });
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
        node.state!.trace!.push({ type: "ai-json", schema, input, result, timestamp: Date.now() });
        return result;
      },
    };
    // todo error handling
    const result = await runNode<T>(node.value, nodeRunnerContext);
    node.state.completedAt = Date.now();
    node.state.result = result;
    node.state.trace.push({ type: "result", result, timestamp: Date.now() });
    this.trace.push({ type: "end-node", node, timestamp: Date.now() });

    return result;
  }

  public async run() {
    this.trace.push({ type: "start", timestamp: Date.now() });
    // run the graph, keep consuming nodes until all nodes are completed
    while (this.runStack.length > 0) {
      const node = this.runStack.pop()!;
      if (node.state?.startedAt) continue;
      if (node.dependencies?.some((dep) => !dep.state?.completedAt)) {
        this.runStack.unshift(node); // todo do this better
        continue;
      }
      await this.startNode(node);
    }
    this.trace.push({ type: "end", timestamp: Date.now() });
  }
}

export async function runGraph(projectContext: ProjectContext, goal: string) {
  const graphRunner = new GraphRunner(projectContext, goal);
  await graphRunner.run();
}
