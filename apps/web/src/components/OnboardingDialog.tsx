import { useState } from "react";
import { faMicrophone } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { ChatBubbleIcon, Cross1Icon } from "@radix-ui/react-icons";
import { Button, Card, Checkbox, Dialog, Text } from "@radix-ui/themes";
import { css } from "styled-system/css";
import { Flex, Stack } from "styled-system/jsx";

import { useLocalStorage } from "../lib/hooks/useLocalStorage";

export function OnboardingDialog() {
  const [doNotShowAgain, setDoNotShowAgain] = useLocalStorage("onboardingDialogShown", false);
  const [showDialog, setShowDialog] = useState(!doNotShowAgain);

  const handleCheckboxChange = () => setDoNotShowAgain(true);

  return (
    <Dialog.Root open={showDialog}>
      <Dialog.Content width="600px">
        <Dialog.Title>Welcome to Nova</Dialog.Title>

        <Stack gap={12} mt={8}>
          <Card>
            <Flex gap={16} alignItems="center">
              <ChatBubbleIcon />
              <Text>
                <strong>Spaces</strong> allow setting goals to create changes within projects.
              </Text>
            </Flex>
            <Flex color="gray" className={css({ ml: 32, fontSize: "14px" })}>
              Currently, Nova only supports one goal per space. All changes are done on the local file system.
            </Flex>
          </Card>

          <Card>
            <Flex gap={16} alignItems="center">
              <Cross1Icon />
              <Text>
                <strong>Iteration</strong> can completely modify existing outputs.
              </Text>
            </Flex>
            <Flex color="gray" className={css({ ml: 32, fontSize: "14px" })}>
              Use this to fix fundamental issues and have Nova try again.
            </Flex>
          </Card>

          <Card>
            <Flex gap={16} alignItems="center">
              <FontAwesomeIcon icon={faMicrophone} />
              <Text>
                <strong>Voice Chat</strong> helps with defining goals and iterations.
              </Text>
            </Flex>
            <Flex color="gray" className={css({ ml: 32, fontSize: "14px" })}>
              Pretend you're talking to a junior engineer!
            </Flex>
          </Card>
        </Stack>
        <Flex css={{ mt: 24 }}>Watch this brief video to get started with Nova.</Flex>

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

        <Flex css={{ mt: 16, fontSize: "14px", textAlign: "center" }}>
          <Text color="gray">
            Disclaimer: Nova is in its early stages. Use at your own risk; no warranty is provided.
          </Text>
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
