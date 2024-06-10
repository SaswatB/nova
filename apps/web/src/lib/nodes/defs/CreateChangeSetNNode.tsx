import { z } from "zod";

import { renderJsonWell, Well } from "../../../components/base/Well";
import { createNodeDef } from "../node-types";
import { orRef } from "../ref-types";
import { ApplyFileChangesNNode } from "./ApplyFileChangesNNode";
import { OutputNNode } from "./OutputNNode";

const ChangeSet = z.object({
  generalNoteList: z
    .string({
      description:
        "General notes for the project, such as packages to install. This should not be used for file changes.",
    })
    .array()
    .optional(),
  filesToChange: z.array(z.object({ absolutePathIncludingFileName: z.string(), steps: z.array(z.string()) })),
});
type ChangeSet = z.infer<typeof ChangeSet>;

export const CreateChangeSetNNode = createNodeDef(
  "create-change-set",
  z.object({ rawChangeSet: orRef(z.string()) }),
  z.object({ result: ChangeSet }),
  {
    run: async (value, nrc) => {
      const changeSet = await nrc.aiJson(
        ChangeSet,
        `
I have a document detailing changes to a project. Please transform the information into a JSON format with the following structure:

1.	General notes for the project, such as packages to install.
2.	A list of all files to change, each containing a list of changes. Only include files that have changes.

Example:
${JSON.stringify({
  generalNoteList: ["This is a general note"],
  filesToChange: [
    {
      absolutePathIncludingFileName: "/root/project/src/file.ts",
      steps: [
        "#### Modify `aiChat` Function\nUpdate the `aiChat` function to include caching.\n\n```typescript\n// utils.ts\nfunction generateCacheKey(model: string, system: string, messages: { role: \"user\" | \"assistant\"; content: string }[]): string {\n  const hash = createHash('sha256');\n  hash.update(model + system + JSON.stringify(messages));\n  return hash.digest('hex');\n}\n\nasync function aiChat(\n  model: 'groq' | 'gpt4o' | 'opus' | 'gemini' | 'geminiFlash',\n  system: string,\n  messages: { role: 'user' | 'assistant'; content: string }[],\n): Promise<string> {\n  const cacheKey = generateCacheKey(model, system, messages);\n  const cachePath = join(CACHE_DIR, `${cacheKey}.json`);\n\n  if (existsSync(cachePath)) {\n    const cachedData = JSON.parse(readFileSync(cachePath, 'utf-8'));\n    // Assuming there is a `timestamp` attribute to validate freshness\n    if (Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) { // 24 hours expiration\n      return cachedData.response;\n    }\n  }\n\n  let response: string;\n  switch (model) {\n    case 'groq':\n      response = await groqChat(system, messages);\n      break;\n    case 'gpt4o':\n      response = await openaiChat(system, messages);\n      break;\n    case 'opus':\n      response = await claudeChat(system, messages);\n      break;\n    case 'gemini':\n      response = await geminiChat(gemini, system, messages);\n      break;\n    case 'geminiFlash':\n      response = await geminiChat(geminiFlash, system, messages);\n      break;\n    default:\n      throw new Error('Invalid model name');\n  }\n\n  writeFileSync(\n    cachePath, \n    JSON.stringify({ response, timestamp: Date.now() }, null, 2)\n  );\n\n  return response;\n}\n```",
      ],
    },
  ],
} satisfies ChangeSet)}

Here's the document content:
${value.rawChangeSet}`.trim(),
      );

      if (changeSet.generalNoteList?.length) {
        nrc.addDependantNode(OutputNNode, {
          description: "General notes for the project",
          value: nrc.createNodeRef({ type: "result", path: "result.generalNoteList", schema: "string[]" }),
        });
      }

      // Deduplicate files to change by their paths and merge their steps
      changeSet.filesToChange = changeSet.filesToChange.reduce(
        (acc, file) => {
          const existingFile = acc.find((f) => f.absolutePathIncludingFileName === file.absolutePathIncludingFileName);
          if (existingFile) existingFile.steps = [...existingFile.steps, ...file.steps];
          else acc.push({ ...file });
          return acc;
        },
        [] as ChangeSet["filesToChange"],
      );

      for (let i = 0; i < changeSet.filesToChange.length; i++) {
        nrc.addDependantNode(ApplyFileChangesNNode, {
          path: nrc.createNodeRef({
            type: "result",
            path: `result.filesToChange[${i}].absolutePathIncludingFileName`,
            schema: "string",
          }),
          changes: nrc.createNodeRef({ type: "result", path: `result.filesToChange[${i}].steps`, schema: "string[]" }),
        });
      }
      return { result: changeSet };
    },
    renderInputs: (v) => (
      <Well title="Raw Change Set" markdownPreferred>
        {v.rawChangeSet}
      </Well>
    ),
    // todo maybe do this better
    renderResult: (res) => renderJsonWell("Result", res.result),
  },
);
