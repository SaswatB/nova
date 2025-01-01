import { orRef } from "streamweave-core";
import { z } from "zod";

import { xmlProjectSettings } from "../ai-helpers";
import { swNode } from "../swNode";

export const ApplyFileChangesNNode = swNode
  .input(z.object({ path: orRef(z.string()), changes: orRef(z.string()) }))
  .output(z.object({ original: z.string(), result: z.string() }))
  .runnable(async (value, nrc) => {
    const existingFile = await nrc.effects.readFile(value.path);
    if (existingFile.type === "directory") throw new Error("Cannot apply changes to a directory");
    const original = existingFile.type === "file" ? existingFile.content : "";

    let output = await nrc.effects.aiChat("gpt4o", [
      `
${xmlProjectSettings(nrc.nodeContext)}

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
    ]);

    if (output.includes("```")) {
      const startIndex = output.indexOf("\n", output.indexOf("```"));
      const endIndex = output.lastIndexOf("\n", output.lastIndexOf("```"));
      output = output.slice(startIndex + 1, endIndex);
    }
    if (output.trim().endsWith("</file>")) {
      output = output.slice(0, output.lastIndexOf("</file>"));
    }

    if (original.endsWith("\n") && !output.endsWith("\n")) {
      output += "\n";
    } else if (!original.endsWith("\n") && output.endsWith("\n")) {
      output = output.slice(0, -1);
    }

    await nrc.effects.writeFile(value.path, output);
    return { original, result: output };
  });
