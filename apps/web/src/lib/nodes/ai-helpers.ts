import uniq from "lodash/uniq";
import { z } from "zod";

import { NodeRunnerContext } from "./node-types";

export async function getRelevantFiles(nrc: NodeRunnerContext, files: string[], document: string) {
  const RelevantFilesSchema = z.object({ files: z.array(z.string()) });
  const directRelevantFiles = await nrc.aiJson(
    RelevantFilesSchema,
    `
Extract all the absolute paths for the files from the following document.
You may need to normalize the file path, here are all the file paths in this project.
Consider them as valid outputs which must be used.
${JSON.stringify(files, null, 2)}

Document:
${document}`.trim(),
  );
  return uniq(directRelevantFiles.files);
}
