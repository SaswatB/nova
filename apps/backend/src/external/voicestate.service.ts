import { singleton } from "tsyringe";

import { VoiceState } from "@repo/shared";

@singleton()
export class VoiceStateService {
  // todo use redis & a ttl
  private state: Record<
    string,
    VoiceState & {
      handleVoiceFunction: (
        functionName: string,
        parameters: Record<string, unknown>
      ) => Promise<unknown>;
    }
  > = {}; // frontendSessionId -> VoiceState

  public async setState(
    sessionId: string,
    state: VoiceState,
    handleVoiceFunction: VoiceStateService["state"][string]["handleVoiceFunction"]
  ) {
    this.state[sessionId] = { ...state, handleVoiceFunction };
  }

  public async getState(sessionId: string) {
    return this.state[sessionId];
  }
}
