import uniq from "lodash/uniq";
import { z } from "zod";

import { ProjectSettings } from "@repo/shared";

import { NodeRunnerContext } from "./node-types";
import { DEFAULT_RULES } from "./projectctx-constants";

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

export async function xmlProjectSettings(settings: ProjectSettings) {
  const rules = (settings.rules?.map((r) => r.text) ?? DEFAULT_RULES).join("\n").trim();
  if (!rules) return "";
  return `<context>\n${rules}\n</context>`;
}