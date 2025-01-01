import { SwNodeResult } from "streamweave-core";

import { Well } from "../../../components/base/Well";
import { ProjectAnalysisNNode } from "./ProjectAnalysisNNode";

export const ProjectAnalysisNNodeRender = {
  renderInputs: () => null,
  renderResult: (result: SwNodeResult<typeof ProjectAnalysisNNode>) => (
    <>
      <Well title="Research" markdownPreferred>
        {result.result.research}
      </Well>
      <Well title="Files" markdownPreferred>
        {result.result.files.length === 0
          ? "No files found (empty project)"
          : `${result.result.files.length} source files processed`}
      </Well>
    </>
  ),
};
