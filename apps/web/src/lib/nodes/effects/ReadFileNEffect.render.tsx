import { SwEffectParam, SwEffectResult } from "streamweave-core";
import { Flex } from "styled-system/jsx";
import { match } from "ts-pattern";

import { Well } from "../../../components/base/Well";
import { ReadFileNEffect } from "./ReadFileNEffect";

export const ReadFileNEffectRender = {
  renderRequestTrace(path: SwEffectParam<typeof ReadFileNEffect>) {
    return (
      <Flex gap="4">
        <span>Path:</span>
        <code>{path}</code>
      </Flex>
    );
  },

  renderResultTrace(result: SwEffectResult<typeof ReadFileNEffect>, path: string) {
    return (
      <Well title={`Read ${result.type === "directory" ? "Directory" : "File"} ${path}`} code={path?.split(".").pop()}>
        {match(result)
          .with({ type: "not-found" }, () => "File not found")
          .with({ type: "file" }, (t) => t.content)
          .with({ type: "directory" }, (t) => t.files.map((f) => f.name).join("\n"))
          .exhaustive()}
      </Well>
    );
  },
};
