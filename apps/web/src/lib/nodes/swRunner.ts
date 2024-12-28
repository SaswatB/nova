import { ExtractGraphRunner, swRunnerInit } from "streamweave-core";

import { ApplyFileChangesNNode } from "./defs/ApplyFileChangesNNode";
import { ContextNNode } from "./defs/ContextNNode";
import { ExecuteNNode } from "./defs/ExecuteNNode";
import { OutputNNode } from "./defs/OutputNNode";
import { PlanNNode } from "./defs/PlanNNode";
import { ProjectAnalysisNNode } from "./defs/ProjectAnalysisNNode";
import { RelevantFileAnalysisNNode } from "./defs/RelevantFileAnalysisNNode";
import { TypescriptDepAnalysisNNode } from "./defs/TypescriptDepAnalysisNNode";
import { WebResearchHelperNNode } from "./defs/WebResearchHelperNNode";
import { WebResearchOrchestratorNNode } from "./defs/WebResearchOrchestratorNNode";
import { WebScraperNNode } from "./defs/WebScraperNNode";

export const swRunner = swRunnerInit.nodes({
  applyFileChanges: ApplyFileChangesNNode,
  context: ContextNNode,
  execute: ExecuteNNode,
  output: OutputNNode,
  plan: PlanNNode,
  projectAnalysis: ProjectAnalysisNNode,
  relevantFileAnalysis: RelevantFileAnalysisNNode,
  typescriptDepAnalysis: TypescriptDepAnalysisNNode,
  webResearchHelper: WebResearchHelperNNode,
  webResearchOrchestrator: WebResearchOrchestratorNNode,
  webScraper: WebScraperNNode,
});

export type GraphRunner = ExtractGraphRunner<typeof swRunner>;
