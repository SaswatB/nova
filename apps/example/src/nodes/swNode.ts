import { swNodeInit } from "streamweave-core";
import { gitEffect } from "../effects/gitEffect";
import { openaiEffect } from "../effects/openaiEffect";

export const swNode = swNodeInit.effects({
  git: gitEffect,
  openai: openaiEffect,
});
