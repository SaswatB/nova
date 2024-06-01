import { ToastContainer } from "react-toastify";
import { ClerkProvider, RedirectToSignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import { Theme } from "@radix-ui/themes";
import { Stack } from "styled-system/jsx";

import { ApiProvider } from "./components/ApiProvider";
import { BrowserGate } from "./components/BrowserGate";
import { Workspace } from "./components/Workspace";
import { env } from "./lib/env";

export function App(): JSX.Element {
  return (
    <ClerkProvider publishableKey={env.VITE_CLERK_PUBLISHABLE_KEY}>
      <Theme appearance="dark">
        <Stack css={{ minW: "screen", minH: "screen" }}>
          <BrowserGate>
            <SignedOut>
              <RedirectToSignIn />
            </SignedOut>
            <SignedIn>
              <ApiProvider>
                <Workspace />
              </ApiProvider>
            </SignedIn>
          </BrowserGate>
        </Stack>
        <ToastContainer position="bottom-right" theme="dark" hideProgressBar newestOnTop />
      </Theme>
    </ClerkProvider>
  );
}
