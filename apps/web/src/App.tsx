import { Suspense } from "react";
import { ToastContainer } from "react-toastify";
import { ClerkProvider, RedirectToSignIn, SignedIn, SignedOut } from "@clerk/clerk-react";
import { VoiceProvider } from "@humeai/voice-react";
import { Theme } from "@radix-ui/themes";
import { useAtomValue } from "jotai";
import { Stack } from "styled-system/jsx";

import { ApiProvider } from "./components/ApiProvider";
import { Loader } from "./components/base/Loader";
import { BrowserGate } from "./components/BrowserGate";
import { Workspace } from "./components/Workspace";
import { env } from "./lib/env";
import { frontendSessionIdAtom } from "./lib/state";
import { trpc } from "./lib/trpc-client";

function AppContent() {
  const [voiceAccessToken] = trpc.voice.accessToken.useSuspenseQuery();
  const frontendSessionId = useAtomValue(frontendSessionIdAtom);

  return (
    <VoiceProvider
      auth={{ type: "accessToken", value: voiceAccessToken }}
      configId="24f17c93-9a3a-4138-a3d2-69d1ea93128d"
      sessionSettings={{ customSessionId: frontendSessionId }}
    >
      <Workspace />
    </VoiceProvider>
  );
}

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
                <Suspense fallback={<Loader fill />}>
                  <AppContent />
                </Suspense>
              </ApiProvider>
            </SignedIn>
          </BrowserGate>
        </Stack>
        <ToastContainer position="bottom-right" theme="dark" hideProgressBar newestOnTop />
      </Theme>
    </ClerkProvider>
  );
}
