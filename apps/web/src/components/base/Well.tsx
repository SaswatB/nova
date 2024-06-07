import Markdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { toast } from "react-toastify";
import { Button } from "@radix-ui/themes";
import { Flex, styled } from "styled-system/jsx";

export function Well({
  children,
  className,
  title,
  markdown,
  copyText,
}: {
  children: string;
  className?: string;
  title?: string;
  markdown?: boolean;
  copyText?: string;
}) {
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
        "& h1": {
          fontSize: "24px",
          fontWeight: "bold",
          marginTop: "16px",
          marginBottom: "8px",
        },
        "& h2": {
          fontSize: "20px",
          fontWeight: "bold",
          marginTop: "14px",
          marginBottom: "7px",
        },
        "& h3": {
          fontSize: "18px",
          fontWeight: "bold",
          marginTop: "12px",
          marginBottom: "6px",
        },
        "& h4": {
          fontSize: "16px",
          fontWeight: "bold",
          marginTop: "10px",
          marginBottom: "5px",
        },
        "& p": {
          fontSize: "16px",
          marginBottom: "10px",
        },
        "& ul": {
          paddingLeft: "20px",
          marginBottom: "10px",
          listStyle: "revert",
        },
        "& ol": {
          paddingLeft: "20px",
          marginBottom: "10px",
          listStyle: "revert",
        },
        "& li": {
          fontSize: "16px",
          marginBottom: "6px",
        },
        "& a": {
          color: "blue",
          textDecoration: "underline",
        },
        "& code": {
          bg: "rgb(30, 30, 30)",
          fontFamily: "monospace",
          padding: "2px 4px",
          borderRadius: "4px",
        },
        "& pre": {
          bg: "rgb(30, 30, 30)",
          px: "8px",
          py: "4px",
          borderRadius: "8px",
          overflowX: "auto",
          "& code": { bg: "unset" },
        },
      }}
    >
      <Flex css={{ mb: "8px" }}>
        {title && <styled.div css={{ fontSize: "16px", fontWeight: "bold" }}>{title}</styled.div>}
        <styled.div css={{ flex: 1, minW: 12 }} />
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
              return match ? (
                <SyntaxHighlighter {...rest} PreTag="div" language={match[1]} style={vscDarkPlus}>
                  {`${children}`.replace(/\n$/, "")}
                </SyntaxHighlighter>
              ) : (
                <code {...rest} className={className}>
                  {children}
                </code>
              );
            },
          }}
        >
          {children}
        </Markdown>
      ) : (
        children
      )}
    </styled.div>
  );
}
