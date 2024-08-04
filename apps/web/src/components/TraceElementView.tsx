import { useRef, useState } from "react";
import { toast } from "react-toastify";
import { Button, Card, Tabs } from "@radix-ui/themes";
import { reverse, sortBy, startCase } from "lodash";
import { css, cx } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";
import { match, P } from "ts-pattern";
import { VList, VListHandle } from "virtua";

import { GraphRunner, GraphTraceEvent, NNode, NNodeTraceEvent } from "../lib/nodes/run-graph";
import { renderJsonWell } from "./base/Well";
import { NNodeBadge } from "./NNodeBadge";

export const traceElementSourceSymbol = Symbol("traceElementSource");
export type TraceElement = GraphTraceEvent | (NNodeTraceEvent & { [traceElementSourceSymbol]: NNode });
export function TraceElementView({
  trace,
  graphRunner,
  isActive,
  isExpanded,
  setIsExpanded,
  onTraceIdNav,
  onNodeNav,
}: {
  trace: TraceElement;
  graphRunner?: GraphRunner;
  isActive: boolean;
  isExpanded: boolean;
  setIsExpanded: (isExpanded: boolean) => void;
  onTraceIdNav: (traceId: string, target: "request" | "result") => void;
  onNodeNav: (node: NNode) => void;
}) {
  const renderSummary = () => {
    if (traceElementSourceSymbol in trace) {
      // NNodeTraceEvent
      return match(trace)
        .with({ type: "start" }, (t) => renderJsonWell("Start Node", t.resolvedValue))
        .with({ type: "dependency" }, (t) => (
          <Flex css={{ alignItems: "center", gap: 4 }}>
            Create dependency <NNodeBadge node={t.node} onNodeNav={onNodeNav} />
          </Flex>
        ))
        .with({ type: "dependency-result" }, (t) => (
          <>
            <Flex css={{ alignItems: "center", gap: 4 }}>
              Result from {t.existing ? "found" : "created"} dependency{" "}
              <NNodeBadge node={t.node} onNodeNav={onNodeNav} />
            </Flex>
            {renderJsonWell("Node Result", t.result)}
          </>
        ))
        .with({ type: "dependant" }, (t) => (
          <Flex css={{ alignItems: "center", gap: 4 }}>
            Create dependant <NNodeBadge node={t.node} onNodeNav={onNodeNav} />
          </Flex>
        ))
        .with({ type: "find-node" }, (t) => (
          <>
            <Flex css={{ alignItems: "center", gap: 4 }}>
              Find node <NNodeBadge node={t.node} onNodeNav={onNodeNav} />
            </Flex>
            {renderJsonWell("Node Result", t.result)}
          </>
        ))
        .with({ type: "effect-request" }, (t) => {
          const effect = graphRunner?.getEffect(t.effectId);
          return (
            <>
              <Flex css={{ alignItems: "center", gap: 8 }}>
                Request <TraceIdButton traceId={t.traceId} onClick={(traceId) => onTraceIdNav(traceId, "result")} />
              </Flex>
              {effect?.renderRequestTrace
                ? effect.renderRequestTrace(t.request)
                : renderJsonWell(`${startCase(t.effectId)} Request`, t.request || "N/A")}
            </>
          );
        })
        .with({ type: "effect-result" }, (t) => {
          const effect = graphRunner?.getEffect(t.effectId);
          const request = t[traceElementSourceSymbol]?.state?.trace?.find(
            (t2) => t2.type === "effect-request" && t.traceId === t2.traceId,
          ) as (NNodeTraceEvent & { type: "effect-request" }) | undefined;
          return (
            <>
              <Flex css={{ alignItems: "center", gap: 7 }}>
                Result <TraceIdButton traceId={t.traceId} onClick={(traceId) => onTraceIdNav(traceId, "request")} />
              </Flex>
              {effect?.renderResultTrace
                ? effect.renderResultTrace(t.result, request?.request)
                : renderJsonWell(`${startCase(t.effectId)} Result`, t.result || "N/A")}
            </>
          );
        })
        .with({ type: "error" }, (t) => renderJsonWell(t.message || "Error", t.error))
        .with({ type: "result" }, (t) => renderJsonWell("Result", t.result))
        .exhaustive();
    }

    // GraphTraceEvent
    return match(trace)
      .with({ type: P.union("start", "end") }, (t) => `Graph ${t.type} event`)
      .with({ type: P.union("start-node", "end-node") }, (t) => (
        <Flex css={{ alignItems: "center", gap: 4 }}>
          {t.type === "start-node" ? "Start" : "End"} node <NNodeBadge node={t.node} onNodeNav={onNodeNav} />
        </Flex>
      ))
      .exhaustive();
  };

  return (
    <Card
      className={cx(
        css({ flex: "none", mx: 16, my: 8, border: isActive ? "1px solid rgb(0, 123, 255)" : "none" }),
        isActive && "pulse",
      )}
    >
      <Flex
        css={{
          px: 2,
          gap: 8,
          alignItems: "center",
          cursor: "pointer",
          "&:hover": { backgroundColor: "background.secondary" },
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {traceElementSourceSymbol in trace ? (
          <NNodeBadge node={trace[traceElementSourceSymbol]} onNodeNav={onNodeNav} />
        ) : null}
        {trace.type === "effect-request" || trace.type === "effect-result"
          ? `${startCase(trace.effectId)} ${trace.type === "effect-request" ? "Request" : "Result"}`
          : startCase(trace.type)}
        <styled.div css={{ flex: 1, minW: 5 }} />
        <styled.div css={{ color: "text.secondary", fontSize: 12, textAlign: "right" }}>
          {new Date(trace.timestamp).toLocaleTimeString()} <br />
          {new Date(trace.timestamp).toLocaleDateString()}
        </styled.div>
      </Flex>
      {isExpanded && (
        <Tabs.Root defaultValue="summary">
          <Tabs.List className={css({ mb: 8 })}>
            <Tabs.Trigger value="summary">Summary</Tabs.Trigger>
            <Tabs.Trigger value="json">JSON</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="summary">
            <Stack css={{ p: 8 }}>{renderSummary()}</Stack>
          </Tabs.Content>
          <Tabs.Content value="json">{renderJsonWell("JSON", trace)}</Tabs.Content>
        </Tabs.Root>
      )}
    </Card>
  );
}

function TraceIdButton({ traceId, onClick }: { traceId: string; onClick: (traceId: string) => void }) {
  return (
    <Button variant="ghost" onClick={() => onClick(traceId)}>
      {traceId}
    </Button>
  );
}

export function TraceElementList({
  trace,
  graphRunner,
  onNodeNav,
}: {
  trace: TraceElement[];
  graphRunner?: GraphRunner;
  onNodeNav: (node: NNode) => void;
}) {
  const scrollRef = useRef<VListHandle>(null);
  const [expandedTraceKeys, setExpandedTraceKeys] = useState<number[]>([]);

  function isActive(t: TraceElement) {
    const active = match(t)
      .with(
        { type: "start", [traceElementSourceSymbol]: undefined },
        (t) => !trace.some((t2) => t2.type === "end" && t.runId === t2.runId),
      )
      .with(
        { type: "start", [traceElementSourceSymbol]: P.not(undefined) },
        (t) =>
          !trace.some(
            (t2) => t2.type === "result" && t[traceElementSourceSymbol].id === t2[traceElementSourceSymbol].id,
          ),
      )
      .with(
        { type: "start-node" },
        (t) => !trace.some((t2) => t2.type === "end-node" && t.node.id === t2.node.id && t.runId === t2.runId),
      )
      .with(
        { type: "effect-request" },
        (t) => !trace.some((t2) => t2.type === "effect-result" && t.traceId === t2.traceId),
      )
      .otherwise(() => false);

    return active && graphRunner?.getActiveRunId() === t.runId;
  }
  const sortedTrace = reverse(sortBy(trace, "timestamp"));

  return (
    <VList ref={scrollRef}>
      {sortedTrace.map((t, i) => {
        const key = trace.length - i;
        return (
          <TraceElementView
            key={key}
            trace={t}
            graphRunner={graphRunner}
            isActive={isActive(t)}
            isExpanded={expandedTraceKeys.includes(key)}
            setIsExpanded={(isExpanded) => {
              if (isExpanded) setExpandedTraceKeys([...expandedTraceKeys, key]);
              else setExpandedTraceKeys(expandedTraceKeys.filter((k) => k !== key));
            }}
            onTraceIdNav={(traceId, target) => {
              const index = sortedTrace.findIndex(
                (t) => "traceId" in t && t.type.includes(target) && t.traceId === traceId,
              );
              if (index !== -1) {
                setExpandedTraceKeys([...expandedTraceKeys, trace.length - index]);
                scrollRef.current?.scrollToIndex(index);
              } else toast.error(`Trace ${target === "request" ? "request" : "result"} not found`);
            }}
            onNodeNav={onNodeNav}
          />
        );
      })}
    </VList>
  );
}
