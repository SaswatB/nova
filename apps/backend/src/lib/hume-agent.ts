import { sortBy } from "lodash";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import { Subject } from "rxjs";
import { container } from "tsyringe";
import { z } from "zod";

import { isDefined } from "@repo/shared";

import { OpenAIService } from "../external/openai.service";
import { VoiceStateService } from "../external/voicestate.service";

const SYSTEM_PROMPT = `
You are a voice chat assistant for Nova.
Nova is a web-based AI coding assistant that reads entire codebases (using the chrome FileSystem API so it works on local files) and makes changes based on provided goals.
An example would be adding a new feature to a mobile website.

Nova works by utilizing a directed acyclic graph (DAG) to represent an agentic flow to make changes.
There are multiple node types, such as Project Analysis, Plan Creation, Change Execution, etc...
Users are shown this DAG and are able to modify it at a granular level.

Your role is to assist users in managing and modifying their codebases efficiently.
You should interact naturally and provide precise, context-aware responses based on the user's requests.

Please be aware of your limitations. 
You will be provided tools to help you interact with the rest of the Nova platform, but you cannot give help or make changes outside of using these tools.
The tools will change based on what the user is currently doing within Nova, so please be aware that a tool may not always be present.
If you do not have enough information to complete a task, you may ask for more information.
Bias towards using tools and making changes, your primary users are experienced coders who may not be very patient.

Everything you output will be spoken aloud with expressive text-to-speech, so tailor all of your responses for voice-only conversations.
NEVER output text-specific formatting like markdown, lists, or anything that is not normally said out loud.
Always prefer easily pronounced words.
Seamlessly incorporate natural vocal inflections like "oh wow" and discourse markers like "I mean" to make your conversation human-like and to ease user comprehension.
Transform numerical values and abbreviations into their full verbal counterparts (e.g., convert "3" to "three" and "Dr." to "doctor").
The voice transcription service may provide emotions captured from the user's voice, use these to guide your responses. Do not provide emotions in your responses.
`.trim();

// Represents the overall structure of the Welcome message.
export const HumeMessagesPayload = z.object({
  messages: z.array(
    z.object({
      type: z.string(),
      message: z.object({
        role: z.enum(["system", "user", "assistant"]),
        content: z.string(),
      }),
      models: z.object({ prosody: z.object({ scores: z.record(z.number()) }) }),
      time: z.object({ begin: z.number(), end: z.number() }).optional(),
    }),
  ),
  custom_session_id: z.string().nullable(),
});
export type HumeMessagesPayload = z.infer<typeof HumeMessagesPayload>;

export class HumeAgent {
  private openai = container.resolve(OpenAIService).client;
  private voiceStateService = container.resolve(VoiceStateService);

  public async respond(messagesPayload: HumeMessagesPayload, messageStream: Subject<unknown>) {
    const { status, functions, handleVoiceFunction } =
      (await this.voiceStateService.getState(messagesPayload.custom_session_id || "")) || {};

    const currentStatus = sortBy(status || [], "priority").at(-1);

    const chat = async (extraMessages: ChatCompletionMessageParam[]) => {
      const messages = [
        { role: "system" as const, content: SYSTEM_PROMPT },
        ...messagesPayload.messages.slice(0, -1).map((entry) => entry.message),
        currentStatus
          ? {
              role: "system" as const,
              content: `This is a transient message showing the user's current status within Nova: ${currentStatus.description}`,
            }
          : undefined,
        messagesPayload.messages.at(-1)?.message,
        ...extraMessages,
      ].filter(isDefined);
      const tools = functions?.length
        ? functions.map(({ name, description, parameters }) => ({
            type: "function" as const,
            function: { name, description, parameters },
          }))
        : undefined;

      return this.openai.chat.completions.create({
        model: "gpt-4o",
        messages,
        tools,
      });
    };

    const extraMessages: ChatCompletionMessageParam[] = [];

    while (extraMessages.length < 20) {
      const response = await chat(extraMessages);
      const output = response.choices[0];

      if (output?.message.content) {
        messageStream.next({
          type: "assistant_input",
          text: output.message.content,
        });
      }

      if (output?.finish_reason === "tool_calls") {
        const toolCalls = output.message.tool_calls;
        const toolResults = await Promise.all(
          (toolCalls || []).map(async (toolCall) => {
            try {
              const toolArguments = JSON.parse(toolCall.function.arguments);
              return {
                toolCall,
                result: handleVoiceFunction?.(toolCall.function.name, toolArguments) || {},
              };
            } catch (e) {
              console.error("Error handling tool call", e, toolCall);
              return { toolCall, result: { error: (e as Error)?.message || e } };
            }
          }),
        );

        extraMessages.push(
          output.message,
          ...toolResults.map((toolResult) => ({
            role: "tool" as const,
            tool_call_id: toolResult.toolCall.id,
            content: JSON.stringify(toolResult),
          })),
        );
      } else {
        break;
      }
    }

    return [{ type: "assistant_end" }];
  }
}
