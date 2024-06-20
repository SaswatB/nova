import "reflect-metadata";

import { ClerkExpressWithAuth } from "@clerk/clerk-sdk-node";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import cors from "cors";
import express from "express";
import * as http from "http";
import { Server as SocketIOServer } from "socket.io";
import { WebSocketServer } from "ws";

import { SIOClientToServerEvents, SIOServerToClientEvents } from "@repo/shared";

import { createAppContext } from "./api/meta/app-server";
import { env } from "./lib/env";
import { handleSioConnection } from "./ws/sio-server";
import { handleWsConnection } from "./ws/ws-server";
import { appRouter } from "./api";

const port = env.PORT || 4000;

const app = express();
const server = http.createServer(app);
app.use(cors());

app.use(
  "/trpc",
  ClerkExpressWithAuth(),
  createExpressMiddleware({
    router: appRouter,
    createContext: createAppContext,
    onError: ({ error }) => console.error(error),
  }),
);

const wss = new WebSocketServer({ server, path: "/ws/v1/llm" });
wss.on("connection", handleWsConnection);

const io = new SocketIOServer<SIOClientToServerEvents, SIOServerToClientEvents>(server, { cors: { origin: "*" } });
io.on("connection", handleSioConnection);

server.listen(port, () => console.log(`Listening on http://localhost:${port}`));
