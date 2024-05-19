import { Stack } from "styled-system/jsx";

import { Workspace } from "./components/Workspace";

export function App(): JSX.Element {
  return (
    <Stack css={{ w: "screen", h: "screen" }}>
      <Workspace />
    </Stack>
  );
}
