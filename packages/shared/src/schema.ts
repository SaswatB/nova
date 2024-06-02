import { z } from "zod";

export enum VoiceStatusPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
}

export const VoiceState = z.object({
  status: z.array(
    z.object({
      id: z.string(),
      description: z.string(),
      priority: z.nativeEnum(VoiceStatusPriority),
    })
  ),
  functions: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      parameters: z.record(z.unknown()),
    })
  ),
});
export type VoiceState = z.infer<typeof VoiceState>;

export interface SIOServerToClientEvents {
  voiceFunction: (
    functionName: string,
    parameters: Record<string, unknown>,
    callback: (result: unknown) => void
  ) => unknown;
}

export interface SIOClientToServerEvents {
  voiceState: (state: VoiceState, sessionId: string) => void;
}
