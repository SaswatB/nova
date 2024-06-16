import { CreateTRPCProxyClient, createTRPCReact } from "@trpc/react-query";
import { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "@repo/backend/src/api/index";

export const trpc = createTRPCReact<AppRouter, unknown, "ExperimentalSuspense">();

export type AppTRPCClient = CreateTRPCProxyClient<AppRouter>;
export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
