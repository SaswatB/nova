import { writeFileSync } from "fs";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { singleton } from "tsyringe";

import { env } from "../lib/env";

@singleton()
export class OpenAIService {
  public readonly client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  public async chat(system: string, messages: ChatCompletionMessageParam[]): Promise<string> {
    const result = await this.client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "system", content: system }, ...messages],
    });
    return result.choices[0]?.message.content ?? "";
  }

  public async formatJson(schema: Record<string, unknown>, prompt: string, data: string) {
    const result = await this.client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Please format the given data to fit the schema.\n${prompt}`.trim(),
        },
        { role: "user", content: data },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "resolve",
            description: "Resolve the formatted data",
            parameters: schema,
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "resolve" } },
    });
    try {
      const out = result.choices[0]?.message.tool_calls?.[0]?.function?.arguments ?? "{}";
      return JSON.parse(out);
    } catch (error) {
      console.error("Failed to parse output", error, result);
      if (env.DOPPLER_ENVIRONMENT === "dev") writeFileSync(`error-${Date.now()}.json`, JSON.stringify(result, null, 2));
      throw error;
    }
  }
}
