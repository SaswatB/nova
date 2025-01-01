import { SwEffectParam, SwEffectResult } from "streamweave-core";
import { Flex } from "styled-system/jsx";

import { renderJsonWell } from "../../../components/base/Well";
import { GetCacheNEffect } from "./GetCacheNEffect";

export const GetCacheNEffectRender = {
  renderRequestTrace(key: SwEffectParam<typeof GetCacheNEffect>) {
    return (
      <Flex gap="4">
        <span>Key:</span>
        <code>{key}</code>
      </Flex>
    );
  },

  renderResultTrace(result: SwEffectResult<typeof GetCacheNEffect>, key: string) {
    return renderJsonWell(`Get Cache Result ${key}`, result);
  },
};
