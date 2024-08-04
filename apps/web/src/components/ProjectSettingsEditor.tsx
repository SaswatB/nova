import { useState } from "react";
import { toast } from "react-toastify";
import { GearIcon } from "@radix-ui/react-icons";
import { AlertDialog, Button, Dialog, IconButton, Separator } from "@radix-ui/themes";
import { css } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";

import { ProjectSettings } from "@repo/shared";

import { SidebarNav } from "./base/SidebarNav";
import { AISettingsEditor } from "./AISettingsEditor";
import { FileAccessEditor } from "./FileAccessEditor";
import { RulesEditor } from "./RulesEditor";

interface ProjectSettingsEditorProps {
  projectId: string;
  allowEdit: true | string;
  settings: ProjectSettings;
  onChange: (settings: ProjectSettings) => void;
  onDelete: () => void;
  onClearCache: () => Promise<void>;
}

export function ProjectSettingsEditor({
  projectId,
  allowEdit,
  settings,
  onChange,
  onDelete,
  onClearCache,
}: ProjectSettingsEditorProps) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("file-access");

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (o && allowEdit !== true) {
          toast.warn(allowEdit);
          return;
        }
        setOpen(o);
      }}
    >
      <Dialog.Trigger>
        <IconButton variant="surface" radius="full">
          <GearIcon />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Content style={{ maxWidth: 800, width: "90vw" }}>
        <Dialog.Title>Settings</Dialog.Title>
        <styled.div css={{ display: "flex", gap: 16 }}>
          <SidebarNav
            items={[
              { value: "file-access", label: "Project File Access" },
              { value: "rules", label: "Project Rules" },
              { value: "ai-settings", label: "AI Settings" },
              { value: "danger-zone", label: "Danger Zone" },
            ]}
            activeValue={activeTab}
            onChange={setActiveTab}
          />
          <Separator orientation="vertical" className={css({ mx: 12, h: "unset" })} />
          <styled.div css={{ flex: 1 }}>
            {activeTab === "file-access" && (
              <FileAccessEditor projectId={projectId} settings={settings} onChange={onChange} />
            )}
            {activeTab === "rules" && (
              <RulesEditor rules={settings.rules} onChange={(newRules) => onChange({ ...settings, rules: newRules })} />
            )}
            {activeTab === "ai-settings" && <AISettingsEditor />}
            {activeTab === "danger-zone" && (
              <Stack>
                <h3>Danger Zone</h3>
                <Flex gap={16}>
                  <AlertDialog.Root>
                    <AlertDialog.Trigger>
                      <Button color="red">Delete Project</Button>
                    </AlertDialog.Trigger>
                    <AlertDialog.Content>
                      <AlertDialog.Title>Are you sure?</AlertDialog.Title>
                      <AlertDialog.Description>
                        This action cannot be undone. This will permanently delete the project and all its data.
                      </AlertDialog.Description>
                      <div style={{ display: "flex", gap: 16, justifyContent: "flex-end" }}>
                        <AlertDialog.Cancel>
                          <Button variant="soft" color="gray">
                            Cancel
                          </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action>
                          <Button
                            color="red"
                            onClick={() => {
                              onDelete();
                              setOpen(false);
                            }}
                          >
                            Delete
                          </Button>
                        </AlertDialog.Action>
                      </div>
                    </AlertDialog.Content>
                  </AlertDialog.Root>
                  <AlertDialog.Root>
                    <AlertDialog.Trigger>
                      <Button color="red">Clear Project Cache</Button>
                    </AlertDialog.Trigger>
                    <AlertDialog.Content>
                      <AlertDialog.Title>Clear Project Cache?</AlertDialog.Title>
                      <AlertDialog.Description>
                        This action will clear all cached data for this project. It may affect performance temporarily.
                      </AlertDialog.Description>
                      <div style={{ display: "flex", gap: 16, justifyContent: "flex-end" }}>
                        <AlertDialog.Cancel>
                          <Button variant="soft" color="gray">
                            Cancel
                          </Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action>
                          <Button color="red" onClick={() => onClearCache()}>
                            Clear Cache
                          </Button>
                        </AlertDialog.Action>
                      </div>
                    </AlertDialog.Content>
                  </AlertDialog.Root>
                </Flex>
              </Stack>
            )}
          </styled.div>
        </styled.div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
