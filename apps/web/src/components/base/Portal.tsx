import { createPortal } from "react-dom";
import { Theme } from "@radix-ui/themes";

export function Portal({ children, name }: { children: React.ReactNode; name: string }) {
  return createPortal(<Theme appearance="dark">{children}</Theme>, document.getElementById(name)!);
}
