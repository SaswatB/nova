import { ExtractGraphRunner, swRunnerInit } from "streamweave-core";
import { ReviewNode } from "./reviewNode";

export const swRunner = swRunnerInit.nodes({
  review: ReviewNode,
});

export type GraphRunner = ExtractGraphRunner<typeof swRunner>;
