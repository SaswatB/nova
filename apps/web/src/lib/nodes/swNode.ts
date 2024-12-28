import { ExtractSwNodeRunnerContext, swNodeInit } from "streamweave-core";

import { ProjectSettings } from "@repo/shared";

import { AIChatNEffect } from "./effects/AIChatNEffect";
import { AIJsonNEffect } from "./effects/AIJsonNEffect";
import { AIScrapeNEffect } from "./effects/AIScrapeNEffect";
import { AIWebSearchNEffect } from "./effects/AIWebSearchNEffect";
import { DisplayToastNEffect } from "./effects/DisplayToastNEffect";
import { GetCacheNEffect } from "./effects/GetCacheNEffect";
import { ReadFileNEffect } from "./effects/ReadFileNEffect";
import { SetCacheNEffect } from "./effects/SetCacheNEffect";
import { WriteDebugFileNEffect } from "./effects/WriteDebugFileNEffect";
import { WriteFileNEffect } from "./effects/WriteFileNEffect";

export const swNode = swNodeInit.context<ProjectSettings>().effects({
  aiChat: AIChatNEffect,
  aiJson: AIJsonNEffect,
  aiScrape: AIScrapeNEffect,
  aiWebSearch: AIWebSearchNEffect,
  getCache: GetCacheNEffect,
  setCache: SetCacheNEffect,
  readFile: ReadFileNEffect,
  writeFile: WriteFileNEffect,
  displayToast: DisplayToastNEffect,
  writeDebugFile: WriteDebugFileNEffect,
});

export type SwNodeRunnerContext = ExtractSwNodeRunnerContext<typeof swNode>;
