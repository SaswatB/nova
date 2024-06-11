import { Subject } from "rxjs";
import { WebSocket } from "ws";

import { HumeAgent, HumeMessagesPayload } from "../lib/hume-agent";

export function handleWsConnection(ws: WebSocket) {
  const agent = new HumeAgent();

  ws.on("message", async (data) => {
    // get payload
    const dataStr = data.toString();
    const payload = HumeMessagesPayload.parse(JSON.parse(dataStr));

    // setup async message sending
    const messageStream = new Subject<unknown>();
    const messageSubscription = messageStream.subscribe((message) =>
      ws.send(JSON.stringify(message))
    );

    // process payload and get responses
    // this also sends async messages while it's processing
    const responses = await agent.respond(payload, messageStream);

    // no more async messages
    messageSubscription.unsubscribe();

    // send remaining responses
    for (const response of responses) {
      ws.send(JSON.stringify(response));
    }
  });

  ws.on("close", () => {
    console.log("WebSocket connection closed");
  });
}
