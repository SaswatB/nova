import { useState } from "react";
import { Button, Checkbox, Dialog, Text } from "@radix-ui/themes";
import { Flex } from "styled-system/jsx";

import { useLocalStorage } from "../lib/hooks/useLocalStorage";

export function OnboardingDialog() {
  const [doNotShowAgain, setDoNotShowAgain] = useLocalStorage("onboardingDialogShown", false);
  const [showDialog, setShowDialog] = useState(!doNotShowAgain);

  const handleCheckboxChange = () => setDoNotShowAgain(true);

  return (
    <Dialog.Root open={showDialog}>
      <Dialog.Content width="600px">
        <Dialog.Title>Welcome to Nova</Dialog.Title>
        <Dialog.Description>Watch this brief video to get started with Nova.</Dialog.Description>
        <Flex pos="relative" justifyContent="center" mt={16}>
          <div style={{ paddingBottom: "64.63195691202873%", height: 0 }}>
            <iframe
              src="https://www.loom.com/embed/fc94e215a2154a718a64d429c3873d18?sid=f3f6a791-7ca2-4a14-84b3-ad3097cea5ba"
              frameBorder="0"
              allowFullScreen
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
            ></iframe>
          </div>
        </Flex>
        <Flex justifyContent="space-between" mt={24}>
          <a href="https://discord.gg/bZxutN8A2q" target="_blank" rel="noreferrer">
            <Button>Join us on Discord</Button>
          </a>
          <Flex alignItems="center" gap={16}>
            <Text as="label" size="2">
              <Flex gap={4}>
                <Checkbox defaultChecked={doNotShowAgain} onCheckedChange={handleCheckboxChange} />
                Don't show again
              </Flex>
            </Text>
            <Button onClick={() => setShowDialog(false)}>Close</Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
