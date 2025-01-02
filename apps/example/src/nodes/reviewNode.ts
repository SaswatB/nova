import { z } from "zod";
import { swNode } from "./swNode";

export const ReviewNode = swNode
  .input(
    z.object({
      branch: z.string(),
      baseBranch: z.string().default("main"),
    })
  )
  .output(
    z.object({
      changes: z.string(),
      review: z.string(),
    })
  )
  .runnable(async (input, context) => {
    // Get git diff
    const changes = await context.effects.git(
      input.branch ? `diff ${input.baseBranch}...${input.branch}` : `diff`
    );

    if (!changes) {
      return {
        changes: "",
        review: "No changes found to review.",
      };
    }

    // Generate review using OpenAI
    const prompt = `Please review the following code changes and provide constructive feedback:

\`\`\`diff
${changes}
\`\`\`

Please provide your review in the following format:
1. Summary of changes
2. Potential issues or concerns
3. Suggestions for improvement
4. Best practices and patterns observed`;

    const review = await context.effects.openai(prompt);

    return {
      changes,
      review,
    };
  });
