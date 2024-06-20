import { WithAuthProp } from "@clerk/clerk-sdk-node";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { Request } from "express";

import { env } from "../../lib/env";

export const createAppContext = async ({ req }: CreateExpressContextOptions) => {
  const benchToken = req.headers["x-bench-api-token"];
  if (benchToken === env.BENCH_API_TOKEN) {
    return { isBench: true };
  }

  const externalAuth = (req as WithAuthProp<Request>).auth;
  if (!externalAuth.userId) throw new Error("Unauthenticated");

  return { externalAuth, isBench: false };
};

type Context = inferAsyncReturnType<typeof createAppContext>;
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const procedure = t.procedure;
