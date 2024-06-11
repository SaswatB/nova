import { useRef, useState } from "react";
import { useAsyncCallback } from "react-async-hook";
import { toast } from "react-toastify";
import { Button, Card, Tabs } from "@radix-ui/themes";
import { reverse, sortBy, startCase } from "lodash";
import { filter, map, Observable } from "rxjs";
import { css } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";
import { match, P } from "ts-pattern";

import { useObservableCallback } from "../lib/hooks/useObservableCallback";
import { useSubject } from "../lib/hooks/useSubject";
import { GraphRunner, GraphTraceEvent, NNode, NNodeTraceEvent } from "../lib/nodes/run-graph";
import { renderJsonWell, Well } from "./base/Well";
import { NNodeBadge } from "./NNodeBadge";

export const traceElementSourceSymbol = Symbol("traceElementSource");
export type TraceElement = GraphTraceEvent | (NNodeTraceEvent & { [traceElementSourceSymbol]: NNode });
export function TraceElementView({
  trace,
  graphRunner,
  scrollToElement$,
  onChatIdNav,
  onNodeNav,
}: {
  trace: TraceElement;
  graphRunner?: GraphRunner;
  scrollToElement$: Observable<boolean>;
  onChatIdNav: (chatId: string, target: "request" | "response") => void;
  onNodeNav: (node: NNode) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const writeFileAsync = useAsyncCallback(
    async (path: string, content: string) => graphRunner?.writeFile(path, content),
    {
      onSuccess: () => toast.success("File saved"),
      onError: (error) => toast.error("Failed to save file: " + error),
    },
  );

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
        .with({ type: "get-cache" }, (t) => renderJsonWell(`Cache Get ${t.key}`, t.result))
        .with({ type: "set-cache" }, (t) => renderJsonWell(`Cache Set ${t.key}`, t.value))
        .with({ type: "read-file" }, (t) => (
          <Well
            title={`Read ${t.result.type === "directory" ? "Directory" : "File"} ${t.path}`}
            code={t.path.split(".").pop()}
          >
            {match(t.result)
              .with({ type: "not-found" }, () => "File not found")
              .with({ type: "file" }, (t) => t.content)
              .with({ type: "directory" }, (t) => t.files.join("\n"))
              .exhaustive()}
          </Well>
        ))
        .with({ type: "write-file" }, (t) => (
          <Well title={`Write File${t.dryRun ? " (Dry Run)" : ""} ${t.path}`} code={t.path.split(".").pop()}>
            {t.content}
          </Well>
        ))
        .with({ type: "ai-chat-request" }, (t) => (
          <>
            <Flex css={{ alignItems: "center", gap: 4 }}>
              AI Chat Request to <b>{t.model}</b>{" "}
              <ChatIdButton chatId={t.chatId} onClick={() => onChatIdNav(t.chatId, "response")} />
            </Flex>

            {t.messages.map((m, i) => (
              <Well key={i} title={m.role} markdownPreferred>
                {m.content}
              </Well>
            ))}
          </>
        ))
        .with({ type: "ai-chat-response" }, (t) => (
          <>
            <Flex css={{ alignItems: "center", gap: 4 }}>
              AI Chat Response <ChatIdButton chatId={t.chatId} onClick={() => onChatIdNav(t.chatId, "request")} />
            </Flex>
            <Well title="Assistant" markdownPreferred>
              {t.result}
            </Well>
          </>
        ))
        .with({ type: "ai-json-request" }, (t) => (
          <>
            <Flex css={{ alignItems: "center", gap: 4 }}>
              AI JSON Request <ChatIdButton chatId={t.chatId} onClick={() => onChatIdNav(t.chatId, "response")} />
            </Flex>
            <Well title="Input" markdownPreferred>
              {t.input}
            </Well>
          </>
        ))
        .with({ type: "ai-json-response" }, (t) => (
          <>
            <Flex css={{ alignItems: "center", gap: 4 }}>
              AI JSON Response <ChatIdButton chatId={t.chatId} onClick={() => onChatIdNav(t.chatId, "request")} />
            </Flex>
            {renderJsonWell("Result", t.result)}
          </>
        ))
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

  const cardRef = useRef<HTMLDivElement>(null);
  useObservableCallback(scrollToElement$, () => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setExpanded(true);
  });

  return (
    <Card ref={cardRef} className={css({ flex: "none", mx: 16, my: 8 })}>
      <Flex
        css={{
          px: 2,
          gap: 8,
          alignItems: "center",
          cursor: "pointer",
          "&:hover": { backgroundColor: "background.secondary" },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {traceElementSourceSymbol in trace ? (
          <NNodeBadge node={trace[traceElementSourceSymbol]} onNodeNav={onNodeNav} />
        ) : null}
        {startCase(trace.type)}
        <styled.div css={{ flex: 1, minW: 5 }} />
        <styled.div css={{ color: "text.secondary", fontSize: 12, textAlign: "right" }}>
          {new Date(trace.timestamp).toLocaleTimeString()} <br />
          {new Date(trace.timestamp).toLocaleDateString()}
        </styled.div>
      </Flex>
      {expanded && (
        <Tabs.Root defaultValue="summary">
          <Tabs.List className={css({ mb: 8 })}>
            <Tabs.Trigger value="summary">Summary</Tabs.Trigger>
            <Tabs.Trigger value="json">JSON</Tabs.Trigger>
          </Tabs.List>
          <Tabs.Content value="summary">
            <Stack css={{ p: 8 }}>{renderSummary()}</Stack>
          </Tabs.Content>
          <Tabs.Content value="json">
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
            {renderJsonWell("JSON", trace)}
          </Tabs.Content>
        </Tabs.Root>
      )}
    </Card>
  );
}

function ChatIdButton({ chatId, onClick }: { chatId: string; onClick: (chatId: string) => void }) {
  return (
    <Button variant="ghost" onClick={() => onClick(chatId)}>
      {chatId}
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
  const scrollToElement = useSubject<{ element: TraceElement }>();

  return reverse(sortBy(trace, "timestamp")).map((t, i) => (
    <TraceElementView
      key={i}
      trace={t}
      graphRunner={graphRunner}
      scrollToElement$={scrollToElement.pipe(filter(({ element }) => element === t)).pipe(map(() => true))}
      onChatIdNav={(chatId, target) => {
        const element = trace.find(
          (t) => t.type === (target === "request" ? "ai-chat-request" : "ai-chat-response") && t.chatId === chatId,
        );
        if (element) scrollToElement.next({ element });
        else toast.error(`Chat ${target === "request" ? "request" : "response"} not found`);
      }}
      onNodeNav={onNodeNav}
    />
  ));
}
