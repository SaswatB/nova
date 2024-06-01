import { WithAuthProp } from "@clerk/clerk-sdk-node";
import { inferAsyncReturnType, initTRPC } from "@trpc/server";
import { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { Request } from "express";

export const createAppContext = async ({
  req,
}: CreateExpressContextOptions) => {
  const externalAuth = (req as WithAuthProp<Request>).auth;
  if (!externalAuth.userId) throw new Error("Unauthenticated");

  return { externalAuth };
};

type Context = inferAsyncReturnType<typeof createAppContext>;
const t = initTRPC.context<Context>().create();

export const router = t.router;
export const procedure = t.procedure;
