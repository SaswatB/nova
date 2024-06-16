import { useEffect, useMemo, useState } from "react";
import { toast } from "react-toastify";
import { faMicrophone, faMicrophoneSlash, faPhone, faTrash } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useVoice, VoiceReadyState } from "@humeai/voice-react";
import { Badge, Button, IconButton, Tooltip } from "@radix-ui/themes";
import { atom, useAtomValue, useSetAtom } from "jotai";
import { startCase, throttle } from "lodash";
import { io, Socket } from "socket.io-client";
import { css } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";
import { useDebounce } from "use-debounce";
import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";

import { SIOClientToServerEvents, SIOServerToClientEvents, VoiceState, VoiceStatusPriority } from "@repo/shared";

import { env } from "../lib/env";
import { useUpdatingRef } from "../lib/hooks/useUpdatingRef";
import { frontendSessionIdAtom } from "../lib/state";
import { Portal } from "./base/Portal";

export function VoiceChat() {
  const sessionId = useAtomValue(frontendSessionIdAtom);
  const { readyState, connect, disconnect, isMuted, mute, unmute, isPlaying, messages, clearMessages } = useVoice();

  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!container || !portalContainer) return;

    function refresh() {
      const portalRect = portalContainer!.getBoundingClientRect();
      container!.style.height = `${portalRect.height}px`;

      const containerRect = container!.getBoundingClientRect();
      portalContainer!.style.width = `${containerRect.width}px`;
      portalContainer!.style.left = `${containerRect.left}px`;

      const documentHeight = document.documentElement.scrollHeight;
      portalContainer!.style.bottom = `${documentHeight - containerRect.top - portalRect.height}px`;
    }

    const observer = new ResizeObserver(throttle(refresh, 15, { leading: true, trailing: true }));
    observer.observe(container);
    observer.observe(portalContainer);
    setTimeout(refresh, 100);
    setTimeout(refresh, 300);
    if (container.parentElement) observer.observe(container.parentElement);

    return () => observer.disconnect();
  }, [container, portalContainer]);

  const enabled = readyState === VoiceReadyState.OPEN;

  // #region socket
  const socket = useMemo(
    (): Socket<SIOServerToClientEvents, SIOClientToServerEvents> | undefined =>
      enabled ? io(env.VITE_API_URL) : undefined,
    [enabled],
  );

  const voiceState = useAtomValue(voiceStateAtom);
  useEffect(() => {
    socket?.emit("voiceState", voiceState, sessionId);
  }, [socket, voiceState, sessionId]);

  const voiceFunctionMapRef = useUpdatingRef(useAtomValue(voiceFunctionMapAtom));
  useEffect(() => {
    socket?.on("voiceFunction", async (functionName, parameters, callback) => {
      callback(await voiceFunctionMapRef.current[functionName]?.(parameters));
    });
  }, [socket, voiceFunctionMapRef]);

  // #endregion

  return (
    <Stack ref={setContainer} css={{ w: "100%", alignSelf: "center" }}>
      <Portal>
        <Stack
          ref={setPortalContainer}
          css={{
            position: "fixed",
            zIndex: 1,
            pointerEvents: "auto",
            py: enabled ? 20 : 0,
            px: enabled ? 5 : 0,
            rounded: enabled ? 20 : 0,
            bg: enabled ? "#444" : undefined,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {enabled ? (
            <>
              <styled.span css={{ textAlign: "center" }}>
                {isPlaying ? "Playing" : isMuted ? "Muted" : "Listening..."}
              </styled.span>
              <VoiceStatusDisplay />
              <Flex css={{ justifyContent: "space-evenly" }}>
                <Tooltip content="Clear History">
                  <IconButton variant="surface" onClick={() => clearMessages()}>
                    <FontAwesomeIcon icon={faTrash} />
                  </IconButton>
                </Tooltip>
                {isMuted ? (
                  <Tooltip content="Unmute">
                    <IconButton variant="surface" onClick={() => unmute()}>
                      <FontAwesomeIcon icon={faMicrophoneSlash} />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Tooltip content="Mute">
                    <IconButton variant="surface" onClick={() => mute()}>
                      <FontAwesomeIcon icon={faMicrophone} />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip content="End Talk">
                  <IconButton color="red" onClick={() => disconnect()}>
                    <FontAwesomeIcon icon={faPhone} />
                  </IconButton>
                </Tooltip>
              </Flex>
            </>
          ) : (
            <Button
              variant="soft"
              loading={readyState === VoiceReadyState.CONNECTING}
              onClick={() =>
                connect().catch((e) => {
                  console.error(e);
                  toast.error("Failed to connect to voice");
                })
              }
            >
              Talk to Nova
            </Button>
          )}
        </Stack>
      </Portal>
    </Stack>
  );
}

const voiceStateAtom = atom<VoiceState>({
  status: [],
  functions: [],
});
const voiceFunctionMapAtom = atom<Record<string, ((arg: unknown) => unknown) | undefined>>({});

function VoiceStatusDisplay() {
  const voiceState = useAtomValue(voiceStateAtom);

  return (
    <Tooltip content={voiceState.functions.map((f) => startCase(f.name)).join(", ") || "No functions available"}>
      <Badge className={css({ alignSelf: "center" })}>
        {voiceState.functions.length} function{voiceState.functions.length === 1 ? "" : "s"} available
      </Badge>
    </Tooltip>
  );
}

export function useAddVoiceFunction<T extends z.ZodObject<any>>(
  name: string,
  description: string,
  schema: T,
  func: (args: z.infer<T>) => unknown,
  enabled = true,
) {
  const jsonSchema = useMemo(() => zodToJsonSchema(schema), [schema]);
  const setVoiceState = useSetAtom(voiceStateAtom);
  useEffect(() => {
    if (!enabled) return;
    const def = { name, description, parameters: jsonSchema as Record<string, unknown> };
    setVoiceState((prev) => ({ ...prev, functions: [...prev.functions, def] }));
    return () => setVoiceState((prev) => ({ ...prev, functions: prev.functions.filter((f) => f.name !== def.name) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, JSON.stringify(jsonSchema), setVoiceState, enabled]);

  const funcRef = useUpdatingRef(func);
  const schemaRef = useUpdatingRef(schema);
  const setVoiceFunctionMap = useSetAtom(voiceFunctionMapAtom);
  useEffect(() => {
    if (!enabled) return;
    setVoiceFunctionMap((prev) => ({
      ...prev,
      [name]: (arg) => funcRef.current(schemaRef.current.parse(arg)),
    }));
    return () => setVoiceFunctionMap((prev) => ({ ...prev, [name]: undefined }));
  }, [name, schemaRef, funcRef, setVoiceFunctionMap, enabled]);
}

export function useAddVoiceStatus(description: string, priority = VoiceStatusPriority.MEDIUM, enabled = true) {
  const setVoiceState = useSetAtom(voiceStateAtom);
  const [debouncedDescription] = useDebounce(description, 300);

  useEffect(() => {
    if (!enabled) return;
    const id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const status = { id, description: debouncedDescription, priority };
    setVoiceState((prev) => ({ ...prev, status: [...prev.status, status] }));
    return () => setVoiceState((prev) => ({ ...prev, status: prev.status.filter((s) => s.id !== status.id) }));
  }, [debouncedDescription, priority, setVoiceState, enabled]);
}
