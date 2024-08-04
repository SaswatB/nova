import { Flex } from "styled-system/jsx";
import { match } from "ts-pattern";

import { Well } from "../../../components/base/Well";
import { createNodeEffect } from "../effect-types";

export const ReadFileNEffect = createNodeEffect("read-file", {
  async run(path: string, { projectContext }) {
    if (projectContext.settings.files?.blockedPaths?.some((bp) => path.startsWith(bp))) {
      console.log("[ReadFileNEffect] Blocking read operation for:", path);
      return { type: "not-found" as const };
    }

    const result = await projectContext.readFile(path);
    return result;
  },
  renderRequestTrace: (path) => (
    <Flex gap="4">
      <span>Path:</span>
      <code>{path}</code>
    </Flex>
  ),
  renderResultTrace(result, path) {
    return (
      <Well title={`Read ${result.type === "directory" ? "Directory" : "File"} ${path}`} code={path?.split(".").pop()}>
        {match(result)
          .with({ type: "not-found" }, () => "File not found")
          .with({ type: "file" }, (t) => t.content)
          .with({ type: "directory" }, (t) => t.files.join("\n"))
          .exhaustive()}
      </Well>
    );
  },
});
