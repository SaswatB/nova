import uniq from "lodash/uniq";
import pLimit from "p-limit";
import { z } from "zod";

import { renderJsonWell, Well } from "../../../components/base/Well";
import { xmlProjectSettings } from "../ai-helpers";
import { createNodeDef } from "../node-types";
import { orRef } from "../ref-types";
import { ApplyFileChangesNNode } from "./ApplyFileChangesNNode";
import { ContextNNode, registerContextId } from "./ContextNNode";
import { OutputNNode } from "./OutputNNode";
import { ProjectAnalysisNNode, xmlFileSystemResearch } from "./ProjectAnalysisNNode";

const ExecuteResult = z.object({
  rawChangeSet: z.string(),
  generalNoteList: z
    .string({
      description:
        "General notes for the project, such as packages to install. This should not be used for file changes.",
    })
    .array()
    .optional(),
  filesToChange: z.array(z.object({ absolutePathIncludingFileName: z.string(), steps: z.string() })),
});
type ExecuteResult = z.infer<typeof ExecuteResult>;

export const ExecuteNNode = createNodeDef(
  "execute",
  z.object({ instructions: orRef(z.string()), relevantFiles: orRef(z.array(z.string())) }),
  z.object({ result: ExecuteResult }),
  {
    run: async (value, nrc) => {
      const { result: researchResult } = await nrc.getOrAddDependencyForResult(ProjectAnalysisNNode, {});
      const extraContext = await nrc.findNodeForResult(ContextNNode, (n) => n.contextId === ExecuteNNode_ContextId);

      const executePrompt = `
${xmlProjectSettings(nrc.settings)}
${xmlFileSystemResearch(researchResult, { showResearch: true, showFileContent: true, filterFiles: (f) => value.relevantFiles.includes(f) })}
<instructions>
${value.instructions}
</instructions>${extraContext ? `\n\n<extraContext>\n${extraContext.context}\n</extraContext>` : ""}

Please suggest changes to the provided files based on the plan.
Suggestions may either be snippets or full files (but not both), and it should be clear enough for a junior engineer to understand and apply.
Do not output diffs, snippets must be human readable and usable without counting line numbers.
Prefer snippets unless the file is small (about 50 lines or less) or the change is very large.
Make sure to be very clear about which file is changing and what the change is.
Please include a legend at the top of the file with the absolute path to the files you are changing or creating.
Suggest adding imports in distinct, standalone snippets from the code changes.
Prefer composing multiple snippets over large snippets.
If creating a new file, please provide the full file path and content.
Include general notes the developer should know, if any (such as packages to install).

Example legend:
* file.ts: /root/project/src/file.ts
* file2.ts: /root/project/src/file2.ts (new file)

Example snippet step (Please note how there are no comments within the snippet itself about where it should be placed, and that the snippet content is fully complete):
* this snippet should be applied to /root/project/src/file.ts, after the function foobar.
\`\`\`typescript
function hello() {
console.log("Hello, world!");
}
\`\`\`
* rename function foobar to foo
\`\`\`typescript
function foo() {
\`\`\`
      `.trim();
      nrc.writeDebugFile("debug-execute-prompt.txt", executePrompt);
      const rawChangeSet = await nrc.aiChat("sonnet", [{ role: "user", content: executePrompt }]);
      nrc.writeDebugFile("debug-execute.txt", rawChangeSet);

      const ChangeSetSchema = z.object({
        generalNoteList: z
          .string({
            description:
              "General notes for the project, such as packages to install. This should not be used for file changes.",
          })
          .array()
          .optional(),
        filesToChange: z.array(z.object({ absolutePathIncludingFileName: z.string() })),
      });
      const changeSet = await nrc.aiJson(
        ChangeSetSchema,
        `
I have a document detailing changes to a project. Please transform the information into a JSON format with the following structure:

1.	General notes for the project, such as packages to install.
2.	A list of all files to change, each containing a list of changes. Only include files that have changes.

Example:
${JSON.stringify({
  generalNoteList: ["This is a general note"],
  filesToChange: [{ absolutePathIncludingFileName: "/root/project/src/file.ts" }],
} satisfies z.infer<typeof ChangeSetSchema>)}

You may need to normalize the file path. Here are all the file paths in this project, consider them as valid outputs which must be used unless creating a new file:
${JSON.stringify(
  researchResult.files.map((f) => f.path),
  null,
  2,
)}

Here's the document content:
${rawChangeSet}`.trim(),
      );
      nrc.writeDebugFile("debug-execute-change-set.json", JSON.stringify(changeSet, null, 2));

      // Deduplicate files to change by their paths
      const limit = pLimit(5);
      const filesToChange = await Promise.all(
        uniq(changeSet.filesToChange.map((f) => f.absolutePathIncludingFileName)).map((path) =>
          limit(async () => {
            const steps = await nrc.aiChat("geminiFlash", [
              {
                role: "user",
                content: `
<change_set>
${rawChangeSet}
</change_set>

Please extract and output only the sections of the given change set relevant to the file at "${path}".
Do not calculate or output a diff.
Ensure the output retains the original markdown format, but only includes the relevant sections for the specified file.
`.trim(),
              },
            ]);

            return { absolutePathIncludingFileName: path, steps };
          }),
        ),
      );
      nrc.writeDebugFile("debug-execute-files-to-change.json", JSON.stringify(filesToChange, null, 2));

      if (changeSet.generalNoteList?.length) {
        nrc.addDependantNode(OutputNNode, {
          description: "General notes for the project",
          value: nrc.createNodeRef({ type: "result", path: "result.generalNoteList", schema: "string[]" }),
        });
      }
      for (let i = 0; i < changeSet.filesToChange.length; i++) {
        nrc.addDependantNode(ApplyFileChangesNNode, {
          path: nrc.createNodeRef({
            type: "result",
            path: `result.filesToChange[${i}].absolutePathIncludingFileName`,
            schema: "string",
          }),
          changes: nrc.createNodeRef({ type: "result", path: `result.filesToChange[${i}].steps`, schema: "string" }),
        });
      }
      return { result: { generalNoteList: changeSet.generalNoteList, rawChangeSet, filesToChange: filesToChange } };
    },
    renderInputs: (v) => (
      <>
        <Well title="Instructions" markdownPreferred>
          {v.instructions}
        </Well>
        <Well title="Relevant Files">{v.relevantFiles.map((file) => file).join("\n") || ""}</Well>
      </>
    ),
    renderResult: ({ result: { rawChangeSet, ...rest } }) => (
      <>
        <Well title="Raw Result" markdownPreferred>
          {rawChangeSet}
        </Well>
        {/* todo maybe do this better */}
        {renderJsonWell("Result", rest)}
      </>
    ),
  },
);

export const ExecuteNNode_ContextId = registerContextId(
  ExecuteNNode,
  "execute-context",
  "Extra context for change set creation",
);
