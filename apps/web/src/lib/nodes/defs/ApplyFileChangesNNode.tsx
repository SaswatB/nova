import ReactDiffViewer from "react-diff-viewer";
import { Badge } from "@radix-ui/themes";
import { z } from "zod";

import { Well } from "../../../components/base/Well";
import { xmlProjectSettings } from "../ai-helpers";
import { createNodeDef } from "../node-types";
import { orRef } from "../ref-types";

export const ApplyFileChangesNNode = createNodeDef(
  "apply-file-changes",
  z.object({ path: orRef(z.string()), changes: orRef(z.string()) }),
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
${xmlProjectSettings(nrc.settings)}

<file path="${value.path}">
${original}
</file>
<change_plan>
${value.changes}
</change_plan>

Please take the changes relevant for the given file and output the final file.
Do not output a diff, just the final file.
Your response will directly overwrite the file, so you MUST not omit any of the file content.
The file you are operating on is "${value.path}".
          `.trim(),
        },
      ]);

      if (output.includes("```")) {
        const startIndex = output.indexOf("\n", output.indexOf("```"));
        const endIndex = output.lastIndexOf("\n", output.lastIndexOf("```"));
        output = output.slice(startIndex + 1, endIndex);
      }
      if (output.trim().endsWith("</file>")) {
        output = output.slice(0, output.lastIndexOf("</file>"));
      }

      await nrc.writeFile(value.path, output);
      return { original, result: output };
    },
    renderInputs: (v) => (
      <Well title={`Changes ${v.path}`} markdownPreferred>
        {v.changes || ""}
      </Well>
    ),
    // todo syntax highlighting
    renderResult: (res) => (
      <ReactDiffViewer oldValue={res.original} newValue={res.result} splitView={false} useDarkTheme />
    ),
  },
);
