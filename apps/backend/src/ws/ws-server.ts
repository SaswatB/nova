import { writeFileSync } from "fs";
import { Subject } from "rxjs";
import { WebSocket } from "ws";

import { env } from "../lib/env";
import { HumeAgent, HumeMessagesPayload } from "../lib/hume-agent";

export function handleWsConnection(ws: WebSocket) {
  const agent = new HumeAgent();

  ws.on("message", async (data) => {
    const dataStr = data.toString();

    const now = Date.now();
    if (env.DOPPLER_ENVIRONMENT === "dev")
      writeFileSync(`messages-${now}.json`, dataStr);
    const payload = HumeMessagesPayload.parse(JSON.parse(dataStr));
    const messageStream = new Subject<unknown>();
    const messageSubscription = messageStream.subscribe((message) => {
      if (env.DOPPLER_ENVIRONMENT === "dev")
        writeFileSync(
          `messages-${now}-response-${Date.now()}.json`,
          JSON.stringify(message, null, 2)
        );
      ws.send(JSON.stringify(message));
    });
    const responses = await agent.respond(payload, messageStream);
    messageSubscription.unsubscribe();
    if (env.DOPPLER_ENVIRONMENT === "dev")
      writeFileSync(
        `messages-${now}-response.json`,
        JSON.stringify(responses, null, 2)
      );

    for (const response of responses) {
      ws.send(JSON.stringify(response));
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
  });
}
