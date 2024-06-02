import { createPortal } from "react-dom";
import { Theme } from "@radix-ui/themes";

export function Portal({ children }: { children: React.ReactNode }) {
  return createPortal(<Theme appearance="dark">{children}</Theme>, document.getElementById("portal")!);
}
