import { Button } from "@radix-ui/themes";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

interface SidebarNavProps {
  items: { value: string; label: string }[];
  activeValue: string;
  onChange: (value: string) => void;
}

export function SidebarNav({ items, activeValue, onChange }: SidebarNavProps) {
  return (
    <styled.nav css={{ display: "flex", flexDirection: "column", gap: 2, minWidth: "120px" }}>
      {items.map((item) => (
        <Button
          key={item.value}
          className={css({ w: "100%", borderColor: "transparent", outlineColor: "transparent", boxShadow: "none" })}
          variant={item.value === activeValue ? "soft" : "outline"}
          onClick={() => onChange(item.value)}
        >
          {item.label}
        </Button>
      ))}
    </styled.nav>
  );
}
