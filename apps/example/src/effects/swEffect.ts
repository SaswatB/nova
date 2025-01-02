import OpenAI from "openai";
import { swEffectInit } from "streamweave-core";

export const swEffect = swEffectInit.context<{
  openai: OpenAI;
  cwd: string;
}>();
