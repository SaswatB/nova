import { ToastContainer } from "react-toastify";
import { Theme } from "@radix-ui/themes";
import { Stack } from "styled-system/jsx";

import { Workspace } from "./components/Workspace";

export function App(): JSX.Element {
  return (
    <Theme appearance="dark">
      <Stack css={{ minW: "screen", minH: "screen" }}>
        <Workspace />
      </Stack>
      <ToastContainer position="bottom-right" theme="dark" hideProgressBar newestOnTop />
    </Theme>
  );
}
