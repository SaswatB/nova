import { toast } from "react-toastify";
import { styled } from "styled-system/jsx";
import { z } from "zod";

import { useLocalStorage } from "../lib/hooks/useLocalStorage";
import { onSubmitEnter } from "../lib/key-press";
import { lsKey } from "../lib/keys";
import { PasswordField, ZodForm } from "./ZodForm";

const AISettingsSchema = z.object({
  enabled: z.boolean(),
  openai: z.string(),
  anthropic: z.string(),
  googleGenAI: z.string(),
});

export function AISettingsEditor() {
  const [enabled, setEnabled] = useLocalStorage(lsKey.localModeEnabled, false);
  const [settings, setSettings] = useLocalStorage(lsKey.localModeSettings, {});

  const handleSubmit = ({ enabled, ...apiKeys }: z.infer<typeof AISettingsSchema>) => {
    if (enabled) {
      if (Object.values(apiKeys).every((key) => key)) setSettings({ apiKeys: apiKeys as Required<typeof apiKeys> });
      else {
        toast.error("All API keys are required to be set to enable local mode");
        throw new Error("All API keys are required to be set to enable local mode");
      }
      setEnabled(true);
      toast.success("Local mode enabled");
    } else {
      setSettings({});
      setEnabled(false);
      toast.success("Local mode disabled");
    }
  };

  return (
    <ZodForm
      schema={AISettingsSchema}
      defaultValues={{
        enabled,
        openai: settings.apiKeys?.openai,
        anthropic: settings.apiKeys?.anthropic,
        googleGenAI: settings.apiKeys?.googleGenAI,
      }}
      onSubmit={handleSubmit}
      overrideFieldMap={{
        enabled: {
          label: "Enable Local Mode",
          helper:
            "When enabled, AI requests will be made directly from the browser instead of through the server. Some features will be disabled, such as web search and voice chat.",
        },
        openai: {
          label: "OpenAI",
          renderField: ({ register, onSubmit }) => (
            <PasswordField {...register()} onKeyDown={onSubmitEnter(onSubmit)} placeholder="OpenAI API Key" />
          ),
        },
        anthropic: {
          renderField: ({ register, onSubmit }) => (
            <PasswordField {...register()} onKeyDown={onSubmitEnter(onSubmit)} placeholder="Anthropic API Key" />
          ),
          helper: (
            <>
              Anthropic does not support{" "}
              <styled.a
                css={{ textDecoration: "underline" }}
                href="https://github.com/anthropics/anthropic-sdk-typescript/issues/219"
                target="_blank"
                rel="noopener noreferrer"
              >
                direct calls from the browser
              </styled.a>
              . <br />
              To bypass run{" "}
              <styled.code css={{ bg: "background.primary", p: 1, borderRadius: "4px" }}>
                npx local-cors-proxy --proxyUrl https://api.anthropic.com
              </styled.code>
            </>
          ),
        },
        googleGenAI: {
          renderField: ({ register, onSubmit }) => (
            <PasswordField {...register()} onKeyDown={onSubmitEnter(onSubmit)} placeholder="Google GenAI API Key" />
          ),
        },
      }}
    />
  );
}
