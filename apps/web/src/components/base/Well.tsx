import { useMemo, useState } from "react";
import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { toast } from "react-toastify";
import { Badge, Button } from "@radix-ui/themes";
import { Flex, styled } from "styled-system/jsx";

export function Well({
  children,
  className,
  title,
  markdownPreferred,
  code,
  copyText,
}: {
  children: string;
  className?: string;
  title?: string;
  markdownPreferred?: boolean;
  code?: string; // if provided, will render as code with the language specified
  copyText?: string;
}) {
  const [markdown, setMarkdown] = useState(markdownPreferred);

  const markdownContent = useMemo(() => {
    if (!markdown) return children;
    const lines = children.split("\n");
    const finalLines = [];

    // prompts use a lot of xml tags, so this tries to wrap them in code blocks to make them easier to read
    let inCodeBlock = false;
    let inXmlBlock: string | null = null;
    for (let line of lines) {
      if (line.trim().startsWith("```")) {
        if (inXmlBlock) {
          line = line.replace("```", "\\```"); // escape code blocks within xml
        } else {
          inCodeBlock = !inCodeBlock;
        }
      }
      if (!inCodeBlock && !inXmlBlock) {
        // todo try to block self closing tags
        const match = line.match(/^<([a-zA-Z0-9_-]+)( .*)?>$/);
        if (match) {
          inXmlBlock = match[1]!;
          finalLines.push("```xml");
          console.log({ inXmlBlock, match });
        }
      }
      finalLines.push(line);
      if (inXmlBlock && line.match(new RegExp(`^</ *${inXmlBlock}>$`))) {
        inXmlBlock = null;
        finalLines.push("```");
      }
    }

    return finalLines.join("\n");
  }, [children, markdown]);

  return (
    <styled.div
      className={className}
      css={{
        backgroundColor: "white/10",
        rounded: 16,
        px: 24,
        py: 16,
        whiteSpace: markdown ? "normal" : "pre-wrap",

        // styles for markdown
        "& h1": { fontSize: "24px", fontWeight: "bold", marginTop: "16px", marginBottom: "8px" },
        "& h2": { fontSize: "20px", fontWeight: "bold", marginTop: "14px", marginBottom: "7px" },
        "& h3": { fontSize: "18px", fontWeight: "bold", marginTop: "12px", marginBottom: "6px" },
        "& h4": { fontSize: "16px", fontWeight: "bold", marginTop: "10px", marginBottom: "5px" },
        "& p": { fontSize: "16px", marginBottom: "10px" },
        "& ul": { paddingLeft: "20px", marginBottom: "10px", listStyle: "revert" },
        "& ol": { paddingLeft: "20px", marginBottom: "10px", listStyle: "revert" },
        "& li": { fontSize: "16px", marginBottom: "6px" },
        "& a": { color: "blue", textDecoration: "underline" },
        "& code": { bg: "rgb(30, 30, 30)", fontFamily: "monospace", padding: "2px 4px", borderRadius: "4px" },
        "& pre": {
          bg: "rgb(30, 30, 30)",
          px: "8px",
          py: "4px",
          whiteSpace: "pre-wrap",
          borderRadius: "8px",
          overflowX: "auto",
          "& code": { bg: "unset" },
        },
      }}
    >
      <Flex css={{ mb: "8px", gap: 16 }}>
        {title && <Badge>{title}</Badge>}
        <styled.div css={{ flex: 1, minW: 12 }} />
        {markdownPreferred ? (
          <Button variant="ghost" onClick={() => setMarkdown(!markdown)}>
            {markdown ? "Markdown" : "Raw"}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(copyText ?? children);
            toast.success("Copied to clipboard");
          }}
        >
          Copy
        </Button>
      </Flex>
      {markdown ? (
        <Markdown
          components={{
            code(props) {
              const { children, className, ref, node, ...rest } = props;
              const match = /language-(\w+)/.exec(className || "");
              const element = match ? (
                <SyntaxHighlighter
                  {...rest}
                  PreTag="div"
                  language={match[1]}
                  style={vscDarkPlus}
                  wrapLines
                  wrapLongLines
                >
                  {`${children}`.replace(/\n$/, "")}
                </SyntaxHighlighter>
              ) : (
                <code {...rest} className={className}>
                  {children}
                </code>
              );
              if (!`${children}`.includes("\n")) {
                return element;
              }
              return <CopyAndCollapsible copyText={`${children}`}>{element}</CopyAndCollapsible>;
            },
          }}
        >
          {markdownContent}
        </Markdown>
      ) : code ? (
        <SyntaxHighlighter language={code} style={vscDarkPlus} wrapLines wrapLongLines>
          {children}
        </SyntaxHighlighter>
      ) : (
        children
      )}
    </styled.div>
  );
}

function CopyAndCollapsible({ copyText, children }: { copyText: string; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <styled.div css={{ position: "relative", minH: "20px" }}>
      <Flex css={{ position: "absolute", top: 0, right: 0, gap: 8 }}>
        <Button variant="ghost" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? "Expand" : "Collapse"}
        </Button>
        <Button
          variant="ghost"
          onClick={() => {
            navigator.clipboard.writeText(copyText);
            toast.success("Copied to clipboard");
          }}
        >
          Copy
        </Button>
      </Flex>
      {collapsed ? null : children}
    </styled.div>
  );
}

export function renderJsonWell(title: string, json: unknown) {
  return (
    <Well title={title} code="json">
      {JSON.stringify(json, null, 2)}
    </Well>
  );
}
