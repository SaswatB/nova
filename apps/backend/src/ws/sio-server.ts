import { SIOClientToServerEvents, SIOServerToClientEvents } from "@repo/shared";
import { Socket } from "socket.io";
import { container } from "tsyringe";

import { VoiceStateService } from "../external/voicestate.service";

export function handleSioConnection(
  socket: Socket<SIOClientToServerEvents, SIOServerToClientEvents>
) {
  const voiceStateService = container.resolve(VoiceStateService);
  socket.on("voiceState", async (state, sessionId) => {
    await voiceStateService.setState(
      sessionId,
      state,
      (functionName, parameters) => {
        return new Promise((resolve) =>
          socket.emit("voiceFunction", functionName, parameters, resolve)
        );
      }
    );
  });
}
