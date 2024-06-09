import ReactDiffViewer from "react-diff-viewer";
import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { createNodeDef } from "../node-types";
import { orRef } from "../ref-types";

export const ApplyFileChangesNNode = createNodeDef(
  "apply-file-changes",
  z.object({ path: orRef(z.string()), changes: orRef(z.array(z.string())) }),
  z.object({ original: z.string(), result: z.string() }),
  {
    run: async (value, nrc) => {
      const existingFile = await nrc.readFile(value.path);
      if (existingFile.type === "directory") throw new Error("Cannot apply changes to a directory");
      const original = existingFile.type === "file" ? existingFile.content : "";

      let output = await nrc.aiChat("geminiFlash", [
        {
          role: "user",
          content: `
<context>
${nrc.projectContext.rules.join("\n")}
</context>

Please take the following change set and output the final file, if it looks like the changes are a full file overwrite, output just the changes.
Your response will directly overwrite the file, so you MUST not omit any of the file content.
<file path="${value.path}">
${original}
</file>
<changes>
${value.changes.map((change) => `<change>${change}</change>`).join("\n")}
</changes>
          `.trim(),
        },
      ]);

      if (output.includes("```")) {
        const startIndex = output.indexOf("\n", output.indexOf("```"));
        const endIndex = output.lastIndexOf("\n", output.lastIndexOf("```"));
        output = output.slice(startIndex + 1, endIndex);
      }

      await nrc.writeFile(value.path, output);
      return { original, result: output };
    },
    renderInputs: (v) => (
      <Well title={`Changes ${v.path}`} markdown>
        {v.changes.map((change) => change).join("\n") || ""}
      </Well>
    ),
    // todo syntax highlighting
    renderResult: (res) => (
      <ReactDiffViewer oldValue={res.original} newValue={res.result} splitView={false} useDarkTheme />
    ),
  },
);
