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
    files: {
      projectAnchorFiles: [
        "/Users/saswat/Dropbox/Documents/Projects/nova/apps/desktop/src/renderer/src/components/NodeCanvas.tsx",
      ],
    },
  };

  const goal = "Change NodeCanvas.tsx to display GraphRunner from run-graph.ts.";

  //   const goal = `
  //   You need to create a dynamic and interactive Chrome extension for accessing the McMaster website. The extension should perform the following tasks:

  // 	1.	Inject HTML: Inject an HTML file into the McMaster website to add a stylish button.
  // 	2.	Scrape Cart Contents: When clicked, this button should scrape the contents of the shopping cart, capturing all relevant item details.
  // 	3.	User Interaction: After scraping the cart, prompt the user to enter their desired delivery date for the items.
  // 	4.	Output JSON: Format the scraped data, including the user-provided delivery date, into a JSON file and output this JSON to the browser console.

  // Ensure the extension provides a seamless and user-friendly experience, with clear instructions and smooth interactions.

  // Here's the html file you need to inject into and process:
  // ${readFileSync(join(__dirname, "./mcmaster.html"), "utf-8")}
  //   `.trim();

  await runGraph(projectContext, goal);
}
iterate().catch(console.error);
