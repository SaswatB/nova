import { useAsync } from "react-async-hook";
import ReactDiffViewer from "react-diff-viewer";
import { styled } from "styled-system/jsx";

import { Well } from "../../../components/base/Well";
import { createNodeEffect } from "../effect-types";
import { NodeRunnerContext } from "../node-types";
import { ProjectContext } from "../project-ctx";

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

export const WriteFileNEffect = createNodeEffect(
  "write-file",
  {
    async run({ path, content }: { path: string; content: string }, { projectContext }) {
      if (projectContext.dryRun) {
        console.log(`[WriteFileNEffect] (Dry Run) Skipping write operation for: ${path}`);
        return { dryRun: true };
      }

      const fileExisted = (await projectContext.readFile(path)).type !== "not-found";
      const original = await projectContext.writeFile(path, content);
      return { created: !fileExisted, original };
    },
    canRevert: (p, r) => !r.dryRun,
    async revert({ path }, { created, original, dryRun }, { projectContext }) {
      if (dryRun) {
        console.log("[WriteFileNEffect] (Dry Run) Skipping revert operation for: ${path}");
        return;
      }

      if (created) {
        console.log("[WriteFileNEffect] Deleting file for revert", path);
        await projectContext.deleteFile(path);
      } else {
        console.log("[WriteFileNEffect] Restoring file for revert", path);
        await projectContext.writeFile(path, original || "");
      }
    },
    renderRevertPreview({ path }, { original }, { projectContext }) {
      return {
        title: <code>{path}</code>,
        body: <RevertViewer path={path} original={original || ""} projectContext={projectContext} />,
      };
    },
    renderRequestTrace(req) {
      return (
        <>
          {/* todo restore? */}
          {/* <Button
          // loading={writeFileAsync.loading}
          // onClick={() => void writeFileAsync.execute(trace.path, trace.content)}
          >
            Re-save
          </Button> */}
          <Well title={`Write File ${req.path}`} code={req.path.split(".").pop()}>
            {req.content}
          </Well>
        </>
      );
    },
    renderResultTrace(result, req) {
      return (
        <Well title={`Write File Result ${req?.path}`}>
          {result.dryRun ? "Dry Run: Write operation skipped" : result.created ? "File Created" : "File Updated"}
        </Well>
      );
    },
  },
  (nrc: NodeRunnerContext, path: string, content: string) => nrc.e$(WriteFileNEffect, { path, content }),
);
