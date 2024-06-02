import OpenAI from "openai";
import { container, singleton } from "tsyringe";

import { env } from "../lib/env";

@singleton()
export class OpenAIService extends OpenAI {}
container.register(OpenAIService, {
  useValue: new OpenAI({ apiKey: env.OPENAI_API_KEY }),
});
