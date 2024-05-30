import { Anthropic } from "@anthropic-ai/sdk";
import axios from "axios";
import Groq from "groq-sdk";

import { env } from "./env";

const claude = new Anthropic({ apiKey: env.VITE_CLAUDE_API_KEY });
const groq = new Groq({ apiKey: env.VITE_GROQ_API_KEY });

export async function test() {
  const image1Url = "https://upload.wikimedia.org/wikipedia/commons/a/a7/Camponotus_flavomarginatus_ant.jpg";
  const image1MediaType = "image/jpeg";
  const image1Response = await axios.get(image1Url, { responseType: "blob" });
  const image1Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(btoa(reader.result as string));
    reader.onerror = reject;
    reader.readAsBinaryString(image1Response.data);
  });

  const message = await claude.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: image1MediaType,
              data: image1Data,
            },
          },
          {
            type: "text",
            text: "Describe this image.",
          },
        ],
      },
    ],
  });

  console.log(message);
}
