import * as idb from "idb-keyval";

import { removeLocalStorage } from "./hooks/useLocalStorage";
import { opfsRootPromise } from "./browser-fs";
import { idbKey, lsKey } from "./keys";

export async function cleanupProject(projectId: string) {
  // Remove project root from IndexedDB
  await idb.del(idbKey.projectRoot(projectId));

  // Remove project settings from local storage
  removeLocalStorage(lsKey.projectSettings(projectId));

  // Remove project spaces from local storage
  removeLocalStorage(lsKey.projectSpaces(projectId));

  // lm_a445fd9fd3 Remove project cache from OPFS
  const opfsRoot = await opfsRootPromise;
  opfsRoot.removeEntry(`projects/${projectId}`, { recursive: true });
}
