import { useState } from "react";
import { Badge, Card, TextArea } from "@radix-ui/themes";
import { startCase } from "lodash";
import { css } from "styled-system/css";
import { Flex, styled } from "styled-system/jsx";

import { GraphTraceEvent, NNode, NNodeTraceEvent } from "../lib/prototype/nodes/run-graph";

export const traceElementSourceSymbol = Symbol("traceElementSource");
export type TraceElement = GraphTraceEvent | (NNodeTraceEvent & { [traceElementSourceSymbol]: NNode });
export function TraceElementView({ trace }: { trace: TraceElement }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <Card className={css({ flex: "none", mx: 16, my: 8 })}>
      <Flex
        css={{
          justifyContent: "space-between",
          alignItems: "center",
          cursor: "pointer",
          "&:hover": {
            backgroundColor: "background.secondary",
          },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span>
          {traceElementSourceSymbol in trace ? (
            <Badge className={css({ mr: 12 })}>{startCase(trace[traceElementSourceSymbol].value.type)}</Badge>
          ) : (
            ""
          )}
          {startCase(trace.type)}
        </span>
        <styled.div
          css={{
            color: "text.secondary",
            fontSize: 12,
          }}
        >
          {new Date(trace.timestamp).toLocaleString()}
        </styled.div>
      </Flex>
      {expanded && <TextArea value={JSON.stringify(trace, null, 2)} readOnly resize="vertical" rows={20} />}
    </Card>
  );
}
