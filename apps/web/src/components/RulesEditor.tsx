import { useState } from "react";
import { Button, TextArea } from "@radix-ui/themes";
import { Flex, Stack } from "styled-system/jsx";

import { ProjectSettings } from "@repo/shared";

import { DEFAULT_RULES } from "../lib/nodes/project-ctx";

export function RulesEditor({
  rules,
  onChange,
}: {
  rules: ProjectSettings["rules"];
  onChange: (rules: ProjectSettings["rules"]) => void;
}) {
  const givenRules = (rules?.map((rule) => rule.text) ?? DEFAULT_RULES).join("\n") ?? "";
  const [rulesText, setRulesText] = useState(givenRules);

  const handleChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newRules = rulesText.split("\n").filter((rule) => rule.trim() !== "");
    onChange(newRules.map((rule) => ({ text: rule })));
    setRulesText(event.target.value);
  };

  return (
    <Stack gap="3">
      <TextArea value={rulesText} onChange={handleChange} placeholder="Enter rules, one per line" rows={10} />
      <Flex gap="2" justifyContent="end">
        <Button variant="soft" color="red" disabled={rules === undefined} onClick={() => onChange(undefined)}>
          Reset
        </Button>
      </Flex>
    </Stack>
  );
}
