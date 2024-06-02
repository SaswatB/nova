import { fetchAccessToken as fetchHumeAccessToken } from "@humeai/voice";

import { env } from "../lib/env";
import { procedure, router } from "./meta/app-server";

export const voiceRouter = router({
  accessToken: procedure.query(async () => {
    const accessToken = await fetchHumeAccessToken({
      apiKey: String(env.HUME_API_KEY),
      clientSecret: String(env.HUME_CLIENT_SECRET),
    });
    return accessToken;
  }),
});
