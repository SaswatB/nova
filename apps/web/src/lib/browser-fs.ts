import { asyncToArray, dirname } from "@repo/shared";

import { ReadFileResult } from "./files";

export const opfsRootPromise = navigator.storage.getDirectory();

const handleCache = new WeakMap<
  FileSystemDirectoryHandle,
  Map<string, FileSystemDirectoryHandle | FileSystemFileHandle>
>();
function getHandleCache(handle: FileSystemDirectoryHandle) {
  if (!handleCache.has(handle)) handleCache.set(handle, new Map());
  return handleCache.get(handle)!;
}

export async function getFileHandleForPath(path: string, root: FileSystemDirectoryHandle, createAsDirectory = false) {
  const parts = path.split("/");
  if (parts[0] === "") parts.shift(); // remove leading slash
  if (parts.at(-1) === "") parts.pop(); // remove trailing slash
  if (parts.length === 0) return root;

  let folder = root;
  const breadcrumbs: string[] = [];

  while (parts.length > 0) {
    const part = parts.shift()!;
    breadcrumbs.push(part);

    const folderCache = getHandleCache(folder);

    if (folderCache.has(part)) {
      const cachedHandle = folderCache.get(part)!;
      if (parts.length === 0) return cachedHandle;
      if (cachedHandle.kind !== "directory")
        throw new Error(`Expected directory, found file: ${breadcrumbs.join("/")}`);
      folder = cachedHandle;
      continue;
    }

    let found = false;
    for await (const [name, handle] of folder.entries()) {
      if (name !== part) continue;
      folderCache.set(name, handle);
      if (parts.length === 0) return handle; // found target
      if (handle.kind !== "directory") throw new Error(`Expected directory, found file: ${breadcrumbs.join("/")}`);
      // found intermediate directory
      folder = handle;
      found = true;
      break;
    }
    if (!found) {
      if (createAsDirectory) {
        folder = await folder.getDirectoryHandle(part, { create: true });
        folderCache.set(part, folder);
        if (parts.length === 0) return folder;
      } else {
        return null;
      }
    }
  }

  return null;
}

export async function readFileHandle(path: string, root: FileSystemDirectoryHandle): Promise<ReadFileResult> {
  const handle = await getFileHandleForPath(path, root);
  if (!handle) return { type: "not-found" };
  if (handle.kind === "file") return { type: "file", content: await (await handle.getFile()).text() };

  const entries = await asyncToArray(handle.entries());
  const cache = getHandleCache(handle); // update cache since we have the data
  for (const [name, handle] of entries) cache.set(name, handle);

  return {
    type: "directory",
    files: entries.map(([name, handle]) => ({ type: handle.kind === "file" ? "file" : "directory", name })),
  };
}

export async function writeFileHandle(
  path: string,
  root: FileSystemDirectoryHandle,
  content: string,
  returnOriginal = false,
) {
  const dir = dirname(path);
  const dirHandle = await getFileHandleForPath(dir, root, true);
  if (dirHandle?.kind !== "directory") throw new Error(`Directory not found: ${dir}`);

  const name = path.split("/").at(-1)!;
  const fileHandle = await dirHandle.getFileHandle(name, { create: true });
  const originalContent = returnOriginal ? await (await fileHandle.getFile()).text() : undefined;
  const writable = await fileHandle.createWritable();
  await writable.write(content);
  await writable.close();
  return originalContent;
}
