import { google } from "googleapis";
import { singleton } from "tsyringe";

import { env } from "../lib/env";

@singleton()
export class GoogleService {
  private search = google.customsearch({ version: "v1", auth: env.GOOGLESEARCH_API_KEY });

  public async searchWeb(query: string) {
    const res = await this.search.cse.list({ q: query, cx: "e149a45b462734a85" });
    return (res.data.items || []).map((item) => ({
      title: item.title || null,
      link: item.link || null,
      snippet: item.snippet || null,
    }));
  }
}
