import { swEffect } from "../swEffect";

export const WriteFileNEffect = swEffect
  .runnableAnd(async ({ path, content }: { path: string; content: string }, { effectContext }) => {
    if (effectContext.dryRun) {
      console.log(`[WriteFileNEffect] (Dry Run) Skipping write operation for: ${path}`);
      return { dryRun: true };
    }

    const fileExisted = (await effectContext.readFile(path)).type !== "not-found";
    const original = await effectContext.writeFile(path, content);
    return { created: !fileExisted, original };
  })
  .callAliasAnd((path: string, content: string) => ({ path, content }))
  .revertable({
    canRevert: (p, r) => !r.dryRun,
    async revert({ path }, { created, original, dryRun }, { effectContext }) {
      if (dryRun) {
        console.log("[WriteFileNEffect] (Dry Run) Skipping revert operation for: ${path}");
        return;
      }

      if (created) {
        console.log("[WriteFileNEffect] Deleting file for revert", path);
        await effectContext.deleteFile(path);
      } else {
        console.log("[WriteFileNEffect] Restoring file for revert", path);
        await effectContext.writeFile(path, original || "");
      }
    },
  });

// function RevertViewer({
//   path,
//   original,
//   projectContext,
// }: {
//   path: string;
//   original: string;
//   projectContext: ProjectContext;
// }) {
//   const fileAsync = useAsync(() => projectContext.readFile(path), [path]);

//   if (fileAsync.loading) return <div>Loading diff...</div>;
//   return (
//     <styled.div css={{ maxHeight: "300px", overflow: "auto" }}>
//       <ReactDiffViewer
//         oldValue={fileAsync.result?.type === "file" ? fileAsync.result.content : ""}
//         newValue={original}
//         splitView={false}
//         useDarkTheme
//       />
//     </styled.div>
//   );
// }

// renderRevertPreview({ path }, { original }, { projectContext }) {
//   return {
//     title: <code>{path}</code>,
//     body: <RevertViewer path={path} original={original || ""} projectContext={projectContext} />,
//   };
// },
// renderRequestTrace(req) {
//   return (
//     <>
//       {/* todo restore? */}
//       {/* <Button
//       // loading={writeFileAsync.loading}
//       // onClick={() => void writeFileAsync.execute(trace.path, trace.content)}
//       >
//         Re-save
//       </Button> */}
//       <Well title={`Write File ${req.path}`} code={req.path.split(".").pop()}>
//         {req.content}
//       </Well>
//     </>
//   );
// },
// renderResultTrace(result, req) {
//   return (
//     <Well title={`Write File Result ${req?.path}`}>
//       {result.dryRun ? "Dry Run: Write operation skipped" : result.created ? "File Created" : "File Updated"}
//     </Well>
//   );
// },
