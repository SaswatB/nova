import { useState } from "react";
import { toast } from "react-toastify";
import { GearIcon } from "@radix-ui/react-icons";
import { Dialog, IconButton, Separator } from "@radix-ui/themes";
import { css } from "styled-system/css";
import { styled } from "styled-system/jsx";

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
}

export function ProjectSettingsEditor({ projectId, allowEdit, settings, onChange }: ProjectSettingsEditorProps) {
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
          </styled.div>
        </styled.div>
      </Dialog.Content>
    </Dialog.Root>
  );
}
