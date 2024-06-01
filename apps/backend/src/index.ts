import "reflect-metadata";

import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";

import { createAppContext } from "./api/meta/app-server";
import { env } from "./lib/env";
import { appRouter } from "./api";

const port = env.PORT || 4000;
const app = express();
app.use(cors());

app.use(
  "/trpc",
  ClerkExpressRequireAuth(),
  createExpressMiddleware({
    router: appRouter,
    createContext: createAppContext,
    onError: ({ error }) => console.error(error),
  })
);

app.listen(port, () => console.log(`Listening on http://localhost:${port}`));
