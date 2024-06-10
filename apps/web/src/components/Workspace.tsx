import { useEffect, useMemo, useState } from "react";
import { UseFormReturn } from "react-hook-form";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { UserButton } from "@clerk/clerk-react";
import { Link2Icon, PlusCircledIcon } from "@radix-ui/react-icons";
import { Button, Dialog, IconButton, TextField, Tooltip } from "@radix-ui/themes";
import * as idb from "idb-keyval";
import { startCase } from "lodash";
import { Pane } from "split-pane-react";
import SplitPane from "split-pane-react/esm/SplitPane";
import { css } from "styled-system/css";
import { Flex, Stack, styled } from "styled-system/jsx";
import { stack } from "styled-system/patterns";
import { z } from "zod";

import { useLocalStorage } from "../lib/hooks/useLocalStorage";
import { routes, RoutesPathParams } from "../lib/routes";
import { newId } from "../lib/uid";
import { Select } from "./base/Select";
import { SpaceEditor } from "./SpaceEditor";
import { VoiceChat } from "./VoiceChat";
import { ZodForm } from "./ZodForm";

function AddProject({ onAdd }: { onAdd: (project: { name: string; handle: FileSystemDirectoryHandle }) => void }) {
  const schema = z.object({ rootPath: z.string().min(1), name: z.string().min(1) });
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
      form.setValue("rootPath", result.name, { shouldDirty: true });
      if (!form.getValues().name.trim()) form.setValue("name", startCase(result.name), { shouldDirty: true });
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
        <styled.div css={{ fontSize: "10px", color: "text.secondary", textAlign: "center", mt: 8 }}>
          Nova uploads all your source files to our backend to process them with AI. We don't store any of your files.
        </styled.div>
      </Dialog.Content>
    </Dialog.Root>
  );
}

const getSpacesId = (projectId: string) => `spaces:${projectId}`;

function SpaceSelector({ projectId, spaceId }: { projectId: string; spaceId?: string }) {
  const navigate = useNavigate();

  const [spacesImpl, setSpaces] = useLocalStorage<{ id: string; name: string | null; timestamp: number }[]>(
    getSpacesId(projectId),
    [],
  );
  const spaces = useMemo(() => spacesImpl.sort((a, b) => b.timestamp - a.timestamp), [spacesImpl]);

  useEffect(() => {
    if (!spaces.find((space) => space.id === spaceId)) {
      const newSpaceId = spaces[0]?.id || null;
      if (newSpaceId) navigate(routes.projectSpace.getPath({ projectId, spaceId: newSpaceId }));
    }
  }, [spaceId, spaces, navigate, projectId]);

  return (
    <>
      <Button
        variant="surface"
        className={css({ mb: 8 })}
        onClick={() => {
          const id = newId.space();
          setSpaces([...spaces, { id, name: `Space ${spaces.length + 1}`, timestamp: Date.now() }]);
          navigate(routes.projectSpace.getPath({ projectId, spaceId: id }));
        }}
      >
        New Space
      </Button>

      <Stack css={{ gap: 8 }}>
        {spaces.map((space) => (
          <NavLink key={space.id} to={routes.projectSpace.getPath({ projectId, spaceId: space.id })}>
            <Button
              key={space.id}
              className={css({ w: "100%", borderColor: "transparent", outlineColor: "transparent", boxShadow: "none" })}
              variant={spaceId === space.id ? "soft" : "outline"}
            >
              {space.name || "Unnamed Space"}
            </Button>
          </NavLink>
        ))}
      </Stack>
    </>
  );
}

export function Workspace() {
  const navigate = useNavigate();
  const { projectId, spaceId, pageId } = useParams<Partial<RoutesPathParams["projectSpacePage"]>>();

  const [sizes, setSizes] = useLocalStorage<number[]>("workspace:sizes", [15, 85]);

  const [projects, setProjects] = useLocalStorage<{ id: string; name: string }[]>("projects", []);

  // track the most recent project
  const [lastProjectId, setLastProjectId] = useState<string | null>(projectId || null);
  useEffect(() => {
    if (projectId) setLastProjectId(projectId);
  }, [projectId]);

  // if no project is selected, navigate to the most recent project
  useEffect(() => {
    const newProjectId = lastProjectId || projects[0]?.id || null;
    if (!projectId && newProjectId) navigate(routes.project.getPath({ projectId: newProjectId }), { replace: true });
  }, [projectId, lastProjectId, navigate, projects]);

  return (
    <SplitPane split="vertical" sizes={sizes} onChange={setSizes}>
      <Pane minSize="200px">
        <Stack css={{ p: 24, gap: 0, bg: "background.secondary", maxH: "100vh", h: "100vh" }}>
          <Flex css={{ alignItems: "center", gap: 8 }}>
            <Select
              className={css({ flex: 1 })}
              placeholder="Select a project"
              value={projectId || ""}
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              onChange={(e) => navigate(routes.project.getPath({ projectId: e }))}
            />
            <AddProject
              onAdd={(project) => {
                const id = newId.project();
                idb.set(`project:${id}:root`, project.handle).catch(console.error);
                setProjects([...projects, { id, name: project.name }]);
                navigate(routes.project.getPath({ projectId: id }));
              }}
            />
          </Flex>
          <Stack css={{ flex: 1, overflowY: "auto", pt: 24 }}>
            {projectId ? <SpaceSelector key={projectId} projectId={projectId} spaceId={spaceId} /> : null}
          </Stack>
          <VoiceChat />
          <Flex css={{ justifyContent: "center", mt: 24 }}>
            <UserButton />
          </Flex>
        </Stack>
      </Pane>
      <Pane minSize={20} className={stack()}>
        {projectId && spaceId ? (
          <SpaceEditor
            key={spaceId}
            projectId={projectId}
            projectName={projects.find((project) => project.id === projectId)?.name || ""}
            spaceId={spaceId}
            pageId={pageId}
          />
        ) : null}
      </Pane>
    </SplitPane>
  );
}
