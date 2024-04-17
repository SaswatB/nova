import { useEffect, useMemo, useState } from "react";
import ReactFlow from "reactflow";
import { Flex, Stack } from "styled-system/jsx";

import { fill } from "./components/base";
import { STTClient } from "./lib/stt";

const initialNodes = [
  { id: "1", position: { x: 0, y: 0 }, data: { label: "1" } },
  { id: "2", position: { x: 0, y: 50 }, data: { label: "2" } },
];
const initialEdges = [{ id: "e1-2", source: "1", target: "2" }];

export function App(): JSX.Element {
  const [transcription, setTranscription] = useState<string[]>([]);
  const [partialTranscription, setPartialTranscription] = useState("");

  const sttClient = useMemo(
    () =>
      new STTClient({
        onFullSentence(sentence) {
          setTranscription((t) => [...t, sentence]);
          setPartialTranscription("");
        },
        onRealtimeTranscription(text) {
          setPartialTranscription(text);
        },
      }),
    [],
  );
  useEffect(() => {
    sttClient.connect();
  }, [sttClient]);

  return (
    <Stack css={{ w: "screen", h: "screen" }}>
      <Flex css={fill}>
        <ReactFlow nodes={initialNodes} edges={initialEdges} />
      </Flex>
      <Stack css={fill}>
        <div>
          <h2>Transcription:</h2>
          {transcription.map((sentence, index) => (
            <p key={index}>{sentence}</p>
          ))}
          <h3>Partial Transcription:</h3>
          <p>{partialTranscription}</p>
        </div>
      </Stack>
    </Stack>
  );
}
