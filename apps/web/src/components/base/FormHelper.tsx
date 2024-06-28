import { ReactNode } from "react";
import { Callout } from "@radix-ui/themes";
import { styled } from "styled-system/jsx";

export function FormHelper({
  helper,
  error,
  variant = "text",
}: {
  helper?: ReactNode;
  error?: ReactNode;
  variant?: "callout" | "text";
}) {
  if (!error) {
    if (!helper) return null;
    if (variant === "text")
      return <styled.span css={{ ml: 5, fontSize: 12, color: "text.secondary" }}>{helper}</styled.span>;
    return (
      <Callout.Root>
        <Callout.Text>{helper}</Callout.Text>
      </Callout.Root>
    );
  }
  if (variant === "text")
    return <styled.span css={{ ml: 5, fontSize: 12, color: "status.error" }}>{error}</styled.span>;
  return (
    <Callout.Root color="red">
      <Callout.Text>{error}</Callout.Text>
    </Callout.Root>
  );
}
