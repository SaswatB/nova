import { Badge } from "@radix-ui/themes";
import { ResolveSwNodeRefs, SwNodeResult, SwNodeValue } from "streamweave-core";
import { styled } from "styled-system/jsx";

import { Well } from "../../../components/base/Well";
import { PlanNNode } from "./PlanNNode";

export const PlanNNodeRender = {
  renderInputs: (value: ResolveSwNodeRefs<SwNodeValue<typeof PlanNNode>>) => (
    <>
      <Well title="Goal" markdownPreferred>
        {value.goal}
      </Well>
      {!!value.images?.length && (
        <styled.div>
          <Badge>{value.images.length} images</Badge>
          <styled.div css={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {value.images.map((image, index) => (
              <styled.img
                key={index}
                src={image}
                alt={`Uploaded image ${index + 1}`}
                css={{ width: "100px", height: "100px", objectFit: "contain", bg: "black" }}
                onClick={() => {
                  const win = window.open();
                  if (!win) return;
                  win.document.write(
                    "<img src=" +
                      image +
                      " style='width: 100vw; height: 100vh; object-fit: contain; background-color: black;' />",
                  );
                  win.document.body.style.margin = "0";
                  win.document.body.style.padding = "0";
                  win.document.body.style.overflow = "hidden";
                }}
              />
            ))}
          </styled.div>
        </styled.div>
      )}
      {value.enableWebResearch ? (
        <Badge color="green">Web Research Enabled</Badge>
      ) : (
        <Badge color="red">Web Research Disabled</Badge>
      )}
    </>
  ),
  renderResult: (result: SwNodeResult<typeof PlanNNode>) => (
    <Well title="Result" markdownPreferred>
      {result.result}
    </Well>
  ),
};
