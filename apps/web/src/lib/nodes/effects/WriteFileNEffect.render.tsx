import { useAsync } from "react-async-hook";
import ReactDiffViewer from "react-diff-viewer";
import { SwEffectParam, SwEffectResult } from "streamweave-core";
import { styled } from "styled-system/jsx";

import { Well } from "../../../components/base/Well";
import { ProjectContext } from "../project-ctx";
import { WriteFileNEffect } from "./WriteFileNEffect";

function RevertViewer({
  path,
  original,
  projectContext,
}: {
  path: string;
  original: string;
  projectContext: ProjectContext;
}) {
  const fileAsync = useAsync(() => projectContext.readFile(path), [path]);

  if (fileAsync.loading) return <div>Loading diff...</div>;
  return (
    <styled.div css={{ maxHeight: "300px", overflow: "auto" }}>
      <ReactDiffViewer
        oldValue={fileAsync.result?.type === "file" ? fileAsync.result.content : ""}
        newValue={original}
        splitView={false}
        useDarkTheme
      />
    </styled.div>
  );
}

export const WriteFileNEffectRender = {
  renderRevertPreview(
    { path }: SwEffectParam<typeof WriteFileNEffect>,
    { original }: SwEffectResult<typeof WriteFileNEffect>,
    { projectContext }: { projectContext: ProjectContext },
  ) {
    return {
      title: <code>{path}</code>,
      body: <RevertViewer path={path} original={original || ""} projectContext={projectContext} />,
    };
  },

  renderRequestTrace(req: SwEffectParam<typeof WriteFileNEffect>) {
    return (
      <Well title={`Write File ${req.path}`} code={req.path.split(".").pop()}>
        {req.content}
      </Well>
    );
  },

  renderResultTrace(result: SwEffectResult<typeof WriteFileNEffect>, req?: SwEffectParam<typeof WriteFileNEffect>) {
    return (
      <Well title={`Write File Result ${req?.path}`}>
        {result.dryRun ? "Dry Run: Write operation skipped" : result.created ? "File Created" : "File Updated"}
      </Well>
    );
  },
};
