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
    let found = false;
    for await (const [name, handle] of folder.entries()) {
      if (name !== part) continue;
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
        if (parts.length === 0) return folder;
      } else {
        return null;
      }
    }
  }

  return null;
}