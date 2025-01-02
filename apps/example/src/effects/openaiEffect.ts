import { swEffect } from "./swEffect";

export const openaiEffect = swEffect
  .runnableAnd(
    async ({ prompt }: { prompt: string }, { effectContext: { openai } }) => {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: prompt }],
      });

      return completion.choices[0].message.content || "";
    }
  )
  .callAliasAnd((prompt: string) => ({ prompt }))
  .cacheable();
