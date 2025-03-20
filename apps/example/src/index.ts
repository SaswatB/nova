import OpenAI from "openai";
import { swRunner } from "./nodes/swRunner";

async function main() {
  // Check for OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error("Please set OPENAI_API_KEY environment variable");
    process.exit(1);
  }
  // Initialize OpenAI client
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  // Get cwd and branch from command line args
  let [cwd, branch] = process.argv.slice(2);
  if (!cwd) {
    console.error("Please provide a path to your git repo");
    console.error("Usage: npm start <repo-path> [branch-name]");
    process.exit(1);
  }

  try {
    const cache = new Map<string, any>();

    // Create runner
    const runner = swRunner
      .effectContext({ openai, cwd })
      .cacheProvider({
        // Simple in-memory cache
        get: async (key: string) => cache.get(key),
        set: async (key: string, value: any) => void cache.set(key, value),
      })
      .create();

    console.log(
      branch
        ? `Reviewing changes in branch: ${branch}`
        : "Reviewing changes in working directory"
    );

    // Run the review
    const result = await runner.nodes.review.run({
      branch,
      baseBranch: "main",
    });

    // Output results
    console.log("\nChanges:");
    console.log("--------");
    console.log(result.changes);

    console.log("\nReview:");
    console.log("-------");
    console.log(result.review);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main().catch(console.error);
