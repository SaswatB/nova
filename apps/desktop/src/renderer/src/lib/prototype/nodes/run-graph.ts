import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "fs";
import { isEqual } from "lodash";
import { dirname } from "path";

import { aiChat, openaiJson } from "../ai-chat";
import { NNodeResult, NNodeType, NNodeValue, NodeRunnerContext, ProjectContext } from "./node-types";
import { runNode } from "./run-node";

interface NNode {
  id: string;
  dependencies?: NNode[];
  value: NNodeValue;
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

export async function runGraph(projectContext: ProjectContext, goal: string) {
  const nodes: NNode[] = [{ id: "plan", value: { type: NNodeType.Plan, goal } }];
  const nodeResults = new Map<string, NNodeResult>();

  const runStarted = new Set<string>();
  const runCompleted = new Set<string>();
  const runStack = [...nodes];

  async function startNode<T extends NNodeType>(
    node: NNode & { value: { type: T } },
  ): Promise<NNodeResult & { type: T }> {
    console.log("[runGraph] Starting node", node.id, node.value.type);
    runStarted.add(node.id);

    const nodeRunnerContext: NodeRunnerContext = {
      projectContext,
      addDependantNode: (newNodeValue) => {
        console.log("[runGraph] Adding dependant node", newNodeValue);
        const newNode = {
          id: `${node.value.type}${nodes.length}`,
          value: newNodeValue,
          dependencies: [node],
        };
        nodes.push(newNode);
        runStack.push(newNode);
      },
      getOrAddDependencyForResult: async (nodeValue, inheritDependencies) => {
        const existing = findNodeByValue(node.dependencies || [], nodeValue);
        if (existing) {
          if (!nodeResults.has(existing.id)) throw new Error("Node result not found"); // this shouldn't happen since deps are processed first
          return nodeResults.get(existing.id) as any; // todo should this add the node as a direct dependency?
        }
        console.log("[runGraph] Adding dependency node", nodeValue);
        const newNode = {
          id: `${node.value.type}${nodes.length}`,
          value: nodeValue,
          dependencies: inheritDependencies ? [...(node.dependencies || [])] : undefined,
        };
        node.dependencies = node.dependencies || [];
        node.dependencies.push(newNode);
        nodes.push(newNode);
        return await startNode(newNode as any);
      },
      readFile: async (path) => {
        console.log("[runGraph] Reading file", path);
        if (!existsSync(path)) return { type: "not-found" };
        if (statSync(path).isDirectory()) return { type: "directory", files: readdirSync(path) };
        return { type: "file", content: readFileSync(path, "utf-8") };
      },
      writeFile: async (path, content) => {
        console.log("[runGraph] Writing file", path);
        const dir = dirname(path);
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        writeFileSync(path, content);
      },
      aiChat: async (model, messages) => {
        console.log("[runGraph] AI Chat", model, messages);
        return await aiChat(model, projectContext.systemPrompt, messages);
      },
      aiJson: async (schema, input) => {
        console.log("[runGraph] AI Json", schema, input);
        return await openaiJson(schema, projectContext.systemPrompt, input);
      },
    };
    // todo error handling
    const result = await runNode<T>(node.value, nodeRunnerContext);
    nodeResults.set(node.id, result);
    runCompleted.add(node.id);

    console.log("[runGraph] Completed node", node.id);
    return result;
  }

  // run the graph, keep consuming nodes until all nodes are completed
  while (runStack.length > 0) {
    const node = runStack.pop()!;
    if (runStarted.has(node.id)) continue;
    if (node.dependencies?.some((dep) => !runCompleted.has(dep.id))) {
      runStack.unshift(node); // todo do this better
      continue;
    }
    await startNode(node);
  }
}
