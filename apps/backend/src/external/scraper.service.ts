import puppeteer, { TimeoutError } from "puppeteer";
import { singleton } from "tsyringe";

import { aiJsonImpl } from "@repo/shared";

import { aiApiKeys, env } from "../lib/env";
import { extractWebNodes, getOpenGraphMetadata, superStripWebNodeWithImgMap } from "../lib/web-nodes";

@singleton()
export class ScraperService {
  public async scrapeWebsite(url: string, schema: Record<string, unknown>, prompt: string): Promise<unknown> {
    console.log("scrapePage", url, prompt);
    const browser = await this.getBrowser();
    try {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
      } catch (e) {
        console.error("Error navigating to URL", e);
        // if the navigation timed out, try to get whatever has loaded
        if (!(e instanceof TimeoutError)) throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const title = await page.title();
      const webNodes = await extractWebNodes(page);
      const { strippedNodes } = superStripWebNodeWithImgMap(webNodes);
      const opengraph = await getOpenGraphMetadata(page);

      const siteData = { title, opengraph, html: strippedNodes };
      console.log("siteData", siteData);

      const json = await aiJsonImpl({
        model: "gpt4o",
        schema,
        system: `
Here is a JSON representation of a website with the product I'm interested in.
Assume you cannot navigate the website, only look at the data provided.
Please take careful note of the area percent, text sizes and hierarchy to determine what's most important on the page.
Area percent indicates the percent of all the area on the site an element takes up, higher values usually indicate importance.

${prompt}
        `.trim(),
        data: JSON.stringify(siteData),
        apiKeys: aiApiKeys,
      });

      return json;
    } finally {
      await browser.close();
    }
  }

  private getBrowser() {
    return env.DOPPLER_ENVIRONMENT !== "dev"
      ? puppeteer.connect({ browserWSEndpoint: `wss://chrome.browserless.io?token=${env.BROWSERLESS_API_KEY}` })
      : puppeteer.launch({ headless: false, timeout: 100000, defaultViewport: null, args: [] });
  }
}
