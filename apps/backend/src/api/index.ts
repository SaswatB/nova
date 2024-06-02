import { router } from "./meta/app-server";
import { aiRouter } from "./ai.router";
import { voiceRouter } from "./voice.router";

export const appRouter = router({
  ai: aiRouter,
  voice: voiceRouter,
});
export type AppRouter = typeof appRouter;
