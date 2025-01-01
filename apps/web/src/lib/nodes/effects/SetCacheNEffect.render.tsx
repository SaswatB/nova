import { SwEffectParam } from "streamweave-core";

import { renderJsonWell } from "../../../components/base/Well";
import { SetCacheNEffect } from "./SetCacheNEffect";

export const SetCacheNEffectRender = {
  renderRequestTrace({ key, value }: SwEffectParam<typeof SetCacheNEffect>) {
    return renderJsonWell(`Set Cache ${key}`, value);
  },

  renderResultTrace() {
    return renderJsonWell("Cache Set", "Cache value set successfully");
  },
};
