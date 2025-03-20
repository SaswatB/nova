// based on the example in the core README
import OpenAI from "openai";
import { z } from "zod";
import {
  swEffectInit,
  swNodeInit,
  swRunnerInit,
  ExtractGraphRunner,
} from "streamweave-core";
import { writeFile } from "fs/promises";

// 1. Define Effects
interface EffectContext {
  openai: OpenAI;
}

export const swEffect = swEffectInit.context<EffectContext>();

export const openaiEffect = swEffect
  .runnableAnd(
    async ({ prompt }: { prompt: string }, { effectContext: { openai } }) => {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      });

      return completion.choices[0].message.content || "";
    }
  )
  .callAlias((prompt: string) => ({ prompt }));

export const writeFileEffect = swEffect
  .runnableAnd(async ({ path, content }: { path: string; content: string }) => {
    await writeFile(path, content);
    return true;
  })
  .callAlias((path: string, content: string) => ({ path, content }));

// 2. Create Node Builder
export const swNode = swNodeInit.effects({
  openai: openaiEffect,
  writeFile: writeFileEffect,
});

// 3. Define Nodes
export const GenerateOutlineNode = swNode
  .input(z.object({ topic: z.string() }))
  .output(z.object({ outline: z.string() }))
  .runnable(async ({ topic }, { effects }) => {
    const outline = await effects.openai(
      `Create a brief 3-point outline for a story about: ${topic}`
    );
    return { outline };
  });

export const ExpandStoryNode = swNode
  .input(z.object({ outline: z.string() }))
  .output(z.object({ story: z.string() }))
  .runnable(async ({ outline }, { effects }) => {
    const story = await effects.openai(
      `Expand this outline into a short story:\n${outline}`
    );
    return { story };
  });

export const StoryGeneratorNode = swNode
  .input(z.object({ topic: z.string(), outputPath: z.string() }))
  .output(z.object({ success: z.boolean(), story: z.string() }))
  .runnable(async (input, context) => {
    // Generate outline
    const { outline } = await context.runNode(GenerateOutlineNode, {
      topic: input.topic,
    });

    // Expand into full story
    const { story } = await context.runNode(ExpandStoryNode, { outline });

    const output = ["## Outline", outline, "", "## Story", story].join("\n");

    // Save to file
    const success = await context.effects.writeFile(input.outputPath, output);

    return { success, story };
  });

// 4. Configure Runner
export const swRunner = swRunnerInit.nodes({
  generateOutline: GenerateOutlineNode,
  expandStory: ExpandStoryNode,
  storyGenerator: StoryGeneratorNode,
});

export type GraphRunner = ExtractGraphRunner<typeof swRunner>;

export async function main() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const runner = swRunner.effectContext({ openai }).create();

  // Generate and save a story
  await runner.nodes.storyGenerator.run({
    topic: "A time-traveling coffee cup",
    outputPath: "story.md",
  });
}
main().catch(console.error);
