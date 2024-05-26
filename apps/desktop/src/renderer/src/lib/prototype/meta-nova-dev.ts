import { ProjectContext } from "./nodes/node-types";
import { runGraph } from "./nodes/run-graph";

async function iterate() {
  // const goal = "Move AI Chat helper functions to a separate file.";
  // const srcFiles = [join(__dirname, "./meta-nova-dev.ts")];
  // const goal = "Write a typescript script to help backport general autoAdd chat channels manually.";
  // const srcFiles = ["/Users/saswat/Documents/clones/bridge/apps/mobile/src/components/useTakeSnap.tsx"];

  const projectContext: ProjectContext = {
    systemPrompt: `
You are an expert staff level software engineer.
Working with other staff level engineers on a project.
Do not bikeshed unless asked.
Provide useful responses, make sure to consider when to stay high level and when to dive deep.
    `.trim(),
    rules: [
      "Strict TypeScript is used throughout the codebase.",
      "Type inference is preferred over explicit types when possible.",
      "Prefer concise and expressive code over verbose code, but keep things readable and use comments if necessary.",
      "Never use require, always use import. Any exceptions must be justified with a comment.",
      "Do not refactor the codebase unless required for the task.",
      "Do not delete dead code or comments unless it is directly related to the task.",
      "Keep error handling to a minimum.",
      "Don't worry about unit tests unless they are explicitly asked for.",
      "It's fine to have large complex functions during the initial implementation as this is a proof of concept.",
    ],
    files: { projectAnchorFiles: ["/Users/saswat/Documents/clones/bridge/apps/mobile/src"] },
  };
  const goal = "Write a typescript script to help backport general autoAdd chat channels manually.";

  await runGraph(projectContext, goal);
}
iterate().catch(console.error);
