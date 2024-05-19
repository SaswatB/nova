import { Dispatch, SetStateAction } from "react";
import { ChatNode } from "@renderer/lib/types";
import { Stack } from "styled-system/jsx";

export function NodeViewer({
  node,
  setNode,
}: {
  node: ChatNode | undefined;
  setNode: Dispatch<SetStateAction<ChatNode>>;
}) {
  // const [transcription, setTranscription] = useState<string[]>([]);
  // const [partialTranscription, setPartialTranscription] = useState("");

  // const sttClient = useMemo(
  //   () =>
  //     new STTClient({
  //       onFullSentence(sentence) {
  //         setTranscription((t) => [...t, sentence]);
  //         setPartialTranscription("");
  //       },
  //       onRealtimeTranscription(text) {
  //         setPartialTranscription(text);
  //       },
  //     }),
  //   [],
  // );
  // useEffect(() => {
  //   if (env.VITE_ENABLE_STT) sttClient.connect();
  // }, [sttClient]);
  return (
    <Stack>
      {/*
      <Stack css={fill}>
        <div>
          <h2>Transcription:</h2>
          {transcription.map((sentence, index) => (
            <p key={index}>{sentence}</p>
          ))}
          <h3>Partial Transcription:</h3>
          <p>{partialTranscription}</p>
        </div>
      </Stack> */}
    </Stack>
  );
}
