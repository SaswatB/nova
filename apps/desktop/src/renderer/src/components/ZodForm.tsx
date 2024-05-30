import { Fragment, ReactNode } from "react";
import { UseFormRegisterReturn, UseFormReturn } from "react-hook-form";
import { Button, TextField } from "@radix-ui/themes";
import { useZodForm } from "@renderer/lib/hooks/useZodForm";
import { startCase } from "lodash";
import { Flex, Stack } from "styled-system/jsx";
import { z } from "zod";

import { FormHelper } from "./base/FormHelper";

export function ZodForm<T extends z.ZodObject<any>>({
  defaultValues,
  schema,
  overrideFieldMap,
  onSubmit,
}: {
  defaultValues?: z.infer<T>;
  schema: T;
  overrideFieldMap?: Partial<
    Record<
      keyof z.infer<T>,
      | {
          label?: string;
          renderField?: (options: {
            register: () => UseFormRegisterReturn;
            error?: string;
            form: UseFormReturn<z.infer<T>>;
          }) => ReactNode;
          helper?: string;
        }
      | ((options: {
          register: () => UseFormRegisterReturn;
          error?: string;
          form: UseFormReturn<z.infer<T>>;
        }) => ReactNode)
    >
  >;
  onSubmit: (values: z.infer<T>) => void | Promise<void>;
}) {
  const form = useZodForm({ schema, defaultValues } as any);
  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    form.reset(values);
  });

  const fields = Object.keys(schema.shape).map((key) => {
    const field = schema.shape[key];
    const error = form.formState.errors[key]?.message?.toString();
    const register = () => form.register(key);

    let fieldNode: ReactNode | undefined;
    let helper: string | undefined;
    let label = field.description || startCase(key);
    if (overrideFieldMap && key in overrideFieldMap) {
      const override = overrideFieldMap[key as keyof z.infer<T>]!;
      if (typeof override === "function") return <Fragment key={key}>{override({ register, error, form })}</Fragment>;
      fieldNode = override.renderField?.({ register, error, form });
      helper = override.helper;
      label = override.label || label;
    }

    if (!fieldNode) {
      if (field instanceof z.ZodString) {
        fieldNode = <TextField.Root {...register()} />;
      } else {
        console.error("Unsupported field type", field);
        return null;
      }
    }

    return (
      <Stack key={key} css={{ gap: 1 }}>
        <FormHelper helper={label} />
        {fieldNode}
        <FormHelper helper={helper} error={error} />
      </Stack>
    );
  });

  return (
    <Stack css={{ gap: 16 }}>
      <FormHelper error={form.formState.errors.root?.message} variant="callout" />

      {fields}

      <Flex css={{ justifyContent: "flex-end" }}>
        <Button disabled={!form.formState.isDirty} loading={form.formState.isSubmitting} onClick={handleSubmit}>
          Save
        </Button>
      </Flex>
    </Stack>
  );
}
