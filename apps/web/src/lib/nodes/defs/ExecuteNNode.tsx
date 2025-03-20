import uniq from "lodash/uniq";
import pLimit from "p-limit";
import { orRef } from "streamweave-core";
import { z } from "zod";

import { xmlProjectSettings } from "../ai-helpers";
import { swNode } from "../swNode";
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

export const ExecuteNNode = swNode
  .input(z.object({ instructions: orRef(z.string()), relevantFiles: orRef(z.array(z.string())) }))
  .output(z.object({ result: ExecuteResult }))
  .runnable(async (value, nrc) => {
    const { result: researchResult } = await nrc.runNode(ProjectAnalysisNNode, {});
    const extraContext = await nrc.findNode(ContextNNode, (n) => n.contextId === ExecuteNNode_ContextId);

    const executePrompt = `
${xmlProjectSettings(nrc.nodeContext)}
<knownFiles>
${researchResult.files.map((f) => f.path).join("\n")}
</knownFiles>
${xmlFileSystemResearch(researchResult, { showResearch: true, showFileContent: true, filterFiles: (f) => value.relevantFiles.includes(f) })}
<instructions>
${value.instructions}
</instructions>${extraContext ? `\n\n<extraContext>\n${extraContext.context}\n</extraContext>` : ""}

Please suggest comprehensive changes to the provided files based on the plan and instructions. Your suggestions should be as thorough and complete as reasonably possible, implementing all necessary modifications to fulfill the requirements without deferring any changes as follow-ups.

Guidelines for suggesting changes:
1. Be comprehensive: Implement all necessary changes to fully realize the plan. Don't leave any required modifications as future tasks.
2. Clarity: Ensure all suggestions are clear enough for a junior engineer to understand and apply without additional context.
3. Format: Provide either snippets or full files (not both) for each change.
4. Snippets vs. Full Files:
- Use snippets for targeted changes in larger files.
- Provide full file content for new files or when modifying small files (roughly 50 lines or less).
- Use full file content if changes are extensive and affect multiple parts of the file.
5. No diffs: Snippets must be human-readable and usable without line numbers or diff notation.
6. File identification: Clearly specify which file is being changed for each suggestion.
7. Imports: Suggest adding imports in separate, standalone snippets from code changes.
8. Granularity: Prefer multiple composable snippets over large, monolithic snippets.
9. New files: Provide the full file path and complete content for any new files.
10. Context: Include sufficient content and context in each suggestion to allow an engineer to implement it in isolation.

Output format:
1. Start with a legend listing the absolute paths of all files being changed or created.
2. For each file change:
a. Clearly state the file being modified and the nature of the change.
b. Provide the snippet or full file content as appropriate.
c. If using snippets, clearly describe where in the file the snippet should be placed.
3. Include any general notes for the developer (e.g., packages to install) at the end of your response.

Example legend:
* file.ts: /root/project/src/file.ts
* file2.ts: /root/project/src/file2.ts (new file)

Example snippet:
* Add the following function to /root/project/src/file.ts, after the existing function foobar:
\`\`\`typescript
function hello() {
console.log("Hello world!");
}
\`\`\`

* Rename function foobar to foo in /root/project/src/file.ts:
\`\`\`typescript
function foo() {
\`\`\`

Remember, your suggestions will be split up file by file and given to an engineer to apply.
Ensure each suggestion contains all necessary information for implementation without access to other parts of your response.
      `.trim();
    await nrc.effects.writeDebugFile("debug-execute-prompt.txt", executePrompt);
    const rawChangeSet = await nrc.effects.aiChat("sonnet", [executePrompt]);
    await nrc.effects.writeDebugFile("debug-execute.txt", rawChangeSet);

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
    const changeSet = await nrc.effects.aiJson({
      schema: ChangeSetSchema,
      data: `
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
    });
    await nrc.effects.writeDebugFile("debug-execute-change-set.json", JSON.stringify(changeSet, null, 2));

    // Deduplicate files to change by their paths
    const limit = pLimit(5);
    const filesToChange = await Promise.all(
      uniq(changeSet?.filesToChange.map((f) => f.absolutePathIncludingFileName) || []).map((path) =>
        limit(async () => {
          const steps = await nrc.effects.aiChat("geminiFlash", [
            `
<change_set>
${rawChangeSet}
</change_set>

# Change Set Extraction Prompt

Given the change set enclosed in <change_set> tags and a specific file path, extract and output only the relevant sections for that file. Follow these guidelines:

1. Analyze the change set section by section.
2. Output only sections that explicitly mention or are relevant to the file at "${path}".
3. Preserve the original formatting, including markdown, code blocks, and comments.
4. Do not modify, merge, or omit any content from the relevant sections.
5. Include all comments associated with the relevant sections.
6. Do not add any explanations or modifications to the extracted content.
7. If a section contains multiple file changes, only include the parts specific to "${path}".

Output Structure:
- Begin each section with the original heading or comment.
- Use original markdown formatting for code blocks (\`\`\`) and other elements.
- Separate distinct changes or steps with a horizontal rule (---).

Example Output:

\`\`\`markdown
## Modify ComponentA.tsx

Add the following import:

\`\`\`typescript
import { NewFeature } from './NewFeature';
\`\`\`

Update the render function:

\`\`\`typescript
function render() {
  return (
    <div>
      <NewFeature />
      {/* Existing content */}
    </div>
  );
}
\`\`\`

---

## Update ComponentA.tsx styles

Add this CSS class:

\`\`\`css
.new-feature {
  color: blue;
  font-weight: bold;
}
\`\`\`

Now, process the following change set and extract only the parts relevant to "${path}":
                `.trim(),
          ]);

          return { absolutePathIncludingFileName: path, steps };
        }),
      ),
    );
    await nrc.effects.writeDebugFile("debug-execute-files-to-change.json", JSON.stringify(filesToChange, null, 2));

    if (changeSet?.generalNoteList?.length) {
      nrc.queueNode(OutputNNode, {
        description: "General notes for the project",
        value: nrc.newRef({ type: "result", path: "result.generalNoteList", schema: "string[]" }),
      });
    }
    for (let i = 0; i < (changeSet?.filesToChange || []).length; i++) {
      nrc.queueNode(ApplyFileChangesNNode, {
        path: nrc.newRef({
          type: "result",
          path: `result.filesToChange[${i}].absolutePathIncludingFileName`,
          schema: "string",
        }),
        changes: nrc.newRef({ type: "result", path: `result.filesToChange[${i}].steps`, schema: "string" }),
      });
    }
    return { result: { generalNoteList: changeSet?.generalNoteList, rawChangeSet, filesToChange: filesToChange } };
  });

export const ExecuteNNode_ContextId = registerContextId("execute-context", "Extra context for change set creation");
