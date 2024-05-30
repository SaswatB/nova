import { useEffect, useMemo, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { Link2Icon, PlusCircledIcon } from "@radix-ui/react-icons";
import { Button, Dialog, IconButton, TextField, Tooltip } from "@radix-ui/themes";
import * as idb from "idb-keyval";
import { Pane } from "split-pane-react";
import SplitPane from "split-pane-react/esm/SplitPane";
import { css } from "styled-system/css";
import { Flex, Stack } from "styled-system/jsx";
import { stack } from "styled-system/patterns";
import { z } from "zod";

import { useLocalStorage } from "../lib/hooks/useLocalStorage";
import { newId } from "../lib/uid";
import { Select } from "./base/Select";
import { SpaceEditor } from "./SpaceEditor";
import { ZodForm } from "./ZodForm";

function AddProject({ onAdd }: { onAdd: (project: { name: string; handle: FileSystemDirectoryHandle }) => void }) {
  const schema = z.object({ name: z.string().min(1), rootPath: z.string().min(1) });
  type FormValues = z.infer<typeof schema>;

  const [open, setOpen] = useState(false);
  const [fileHandle, setFileHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const onSubmit = (data: FormValues) => {
    if (!fileHandle) return;
    onAdd({ ...data, handle: fileHandle });
    setOpen(false);
  };

  const openDialog = async (form: UseFormReturn<FormValues>) => {
    const result = await window.showDirectoryPicker({ mode: "readwrite", startIn: "documents" });
    if (result) {
      form.setValue("rootPath", result.name);
      setFileHandle(result);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <IconButton variant="ghost">
          <PlusCircledIcon width="18" height="18" />
        </IconButton>
      </Dialog.Trigger>
      <Dialog.Content width="400px">
        <Dialog.Title>Add Project</Dialog.Title>

        <ZodForm
          schema={schema}
          overrideFieldMap={{
            rootPath: {
              renderField: ({ register, form }) => (
                <TextField.Root {...register()} disabled>
                  <TextField.Slot side="right">
                    <Tooltip content="Open Folder">
                      <IconButton size="1" variant="ghost" onClick={() => openDialog(form)}>
                        <Link2Icon height="14" width="14" />
                      </IconButton>
                    </Tooltip>
                  </TextField.Slot>
                </TextField.Root>
              ),
              helper: "The folder to your project",
            },
          }}
          onSubmit={onSubmit}
        />
      </Dialog.Content>
    </Dialog.Root>
  );
}

const getSpacesId = (projectId: string) => `spaces:${projectId}`;

function SpaceSelector({
  projectId,
  selectedSpaceId,
  setSelectedSpaceId,
}: {
  projectId: string;
  selectedSpaceId: string | null;
  setSelectedSpaceId: (id: string | null) => void;
}) {
  const [spacesImpl, setSpaces] = useLocalStorage<{ id: string; name: string | null; timestamp: number }[]>(
    getSpacesId(projectId),
    [],
  );
  const spaces = useMemo(() => spacesImpl.sort((a, b) => b.timestamp - a.timestamp), [spacesImpl]);

  useEffect(() => {
    if (selectedSpaceId && !spaces.find((space) => space.id === selectedSpaceId)) {
      setSelectedSpaceId(spaces[0]?.id || null);
    }
  }, [selectedSpaceId, setSelectedSpaceId, spaces]);

  return (
    <Stack>
      <Button
        variant="surface"
        className={css({ mb: 8 })}
        onClick={() => {
          const id = newId.space();
          setSpaces([...spaces, { id, name: null, timestamp: Date.now() }]);
          setSelectedSpaceId(id);
        }}
      >
        New Space
      </Button>

      <Stack css={{ gap: 8 }}>
        {spaces.map((space) => (
          <Button
            key={space.id}
            className={css({ borderColor: "transparent", outlineColor: "transparent", boxShadow: "none" })}
            variant={selectedSpaceId === space.id ? "soft" : "outline"}
            onClick={() => setSelectedSpaceId(space.id)}
          >
            {space.name || "Unnamed Space"}
          </Button>
        ))}
      </Stack>
    </Stack>
  );
}

export function Workspace() {
  const [sizes, setSizes] = useLocalStorage<number[]>("workspace:sizes", [15, 85]);

  const [projects, setProjects] = useLocalStorage<{ id: string; name: string }[]>("projects", []);
  const [selectedProjectId, setSelectedProjectIdImpl] = useLocalStorage<string | null>("selectedProjectId", null);
  const [selectedSpaceId, setSelectedSpaceId] = useLocalStorage<string | null>("selectedSpaceId", null);
  const setSelectedProjectId = (id: string | null) => {
    setSelectedProjectIdImpl(id);
    setSelectedSpaceId(null);
  };

  return (
    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
      <Pane minSize={15} className={stack({ p: 24, bg: "background.secondary" })}>
        <Stack>
          <Flex css={{ alignItems: "center", gap: 8, mb: 24 }}>
            <Select
              className={css({ flex: 1 })}
              placeholder="Select a project"
              value={selectedProjectId || ""}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              onChange={(e) => setSelectedProjectId(e)}
            />
            <AddProject
              onAdd={(project) => {
                const id = newId.project();
                idb.set(`project:${id}:root`, project.handle).catch(console.error);
                setProjects([...projects, { id, name: project.name }]);
                setSelectedProjectId(id);
              }}
            />
          </Flex>
          {selectedProjectId ? (
            <SpaceSelector
              key={selectedProjectId}
              projectId={selectedProjectId}
              selectedSpaceId={selectedSpaceId}
              setSelectedSpaceId={setSelectedSpaceId}
            />
          ) : null}
        </Stack>
      </Pane>
      <Pane minSize={20} className={stack()}>
        {selectedSpaceId && selectedProjectId ? (
          <SpaceEditor key={selectedSpaceId} projectId={selectedProjectId} spaceId={selectedSpaceId} />
        ) : null}
      </Pane>
    </SplitPane>
  );
}
