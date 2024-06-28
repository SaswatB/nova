import { toast } from "react-toastify";
import { z } from "zod";

import { useLocalStorage } from "../lib/hooks/useLocalStorage";
import { lsKey } from "../lib/keys";
import { ZodForm } from "./ZodForm";

const AISettingsSchema = z.object({
  enabled: z.boolean(),
  ...lsKey.localModeSettings.schema.shape.apiKeys.unwrap().shape,
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
      }}
    />
  );
}
