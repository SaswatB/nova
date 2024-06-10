import { Suspense } from "react";
import { createBrowserRouter, createRoutesFromElements, Route, RouterProvider, Routes } from "react-router-dom";
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
import { routes } from "./lib/routes";
import { frontendSessionIdAtom } from "./lib/state";
import { trpc } from "./lib/trpc-client";

const router = createBrowserRouter(
  createRoutesFromElements([
    <Route key={routes.home.path} path={routes.home.path} element={<Workspace />} />,
    <Route key={routes.project.path} path={routes.project.path} element={<Workspace />} />,
    <Route key={routes.projectSpace.path} path={routes.projectSpace.path} element={<Workspace />} />,
    <Route key={routes.projectSpacePage.path} path={routes.projectSpacePage.path} element={<Workspace />} />,
  ]),
);

function AppContent() {
  const [voiceAccessToken] = trpc.voice.accessToken.useSuspenseQuery();
  const frontendSessionId = useAtomValue(frontendSessionIdAtom);

  return (
    <VoiceProvider
      auth={{ type: "accessToken", value: voiceAccessToken }}
      configId={
        env.VITE_API_URL.includes("localhost")
          ? "7b9b894d-7d8c-4fbd-984f-132c2d0e0ffd" // https://beta.hume.ai/evi/configs/7b9b894d-7d8c-4fbd-984f-132c2d0e0ffd
          : "24f17c93-9a3a-4138-a3d2-69d1ea93128d"
      }
      sessionSettings={{ customSessionId: frontendSessionId }}
    >
      <RouterProvider router={router} />
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
