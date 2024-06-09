import { useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import { toast } from "react-toastify";
import { Badge, Button, Card, TextArea } from "@radix-ui/themes";
import { startCase } from "lodash";
import { css } from "styled-system/css";
import { Flex, styled } from "styled-system/jsx";

import { GraphRunner, GraphTraceEvent, NNode, NNodeTraceEvent } from "../lib/nodes/run-graph";

export const traceElementSourceSymbol = Symbol("traceElementSource");
export type TraceElement = GraphTraceEvent | (NNodeTraceEvent & { [traceElementSourceSymbol]: NNode });
export function TraceElementView({ trace, graphRunner }: { trace: TraceElement; graphRunner?: GraphRunner }) {
  const [expanded, setExpanded] = useState(false);
  const writeFileAsync = useAsyncCallback(
    async (path: string, content: string) => graphRunner?.writeFile(path, content),
    {
      onSuccess: () => toast.success("File saved"),
      onError: (error) => toast.error("Failed to save file: " + error),
    },
  );

  return (
    <Card className={css({ flex: "none", mx: 16, my: 8 })}>
      <Flex
        css={{
          px: 2,
          alignItems: "center",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: "background.secondary",
          },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {traceElementSourceSymbol in trace ? (
          <Badge className={css({ mr: 12 })}>{startCase(trace[traceElementSourceSymbol].typeId)}</Badge>
        ) : (
          ""
        )}
        {startCase(trace.type)}
        <styled.div css={{ flex: 1, minW: 5 }} />
        <styled.div css={{ color: "text.secondary", fontSize: 12, textAlign: "right" }}>
          {new Date(trace.timestamp).toLocaleTimeString()} <br />
          {new Date(trace.timestamp).toLocaleDateString()}
        </styled.div>
      </Flex>
      {expanded && (
        <>
          {trace.type === "write-file" && (
            <>
              <Button
                loading={writeFileAsync.loading}
                onClick={() => void writeFileAsync.execute(trace.path, trace.content)}
              >
                Re-save
              </Button>
            </>
          )}
          <TextArea
            className={css({ mt: 4 })}
            value={JSON.stringify(trace, null, 2)}
            readOnly
            resize="vertical"
            rows={20}
          />
        </>
      )}
    </Card>
  );
}
