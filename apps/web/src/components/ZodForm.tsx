import { Fragment, ReactNode, useImperativeHandle } from "react";
import {
  Control,
  DefaultValues,
  Path,
  PathValue,
  SetValueConfig,
  useController,
  UseFormRegisterReturn,
  UseFormReturn,
} from "react-hook-form";
import { Link1Icon, TrashIcon } from "@radix-ui/react-icons";
import { Button, Checkbox, IconButton, TextArea, TextField, Tooltip } from "@radix-ui/themes";
import { startCase } from "lodash";
import { css } from "styled-system/css";
import { Flex, Stack } from "styled-system/jsx";
import { UnknownKeysParam, z, ZodTypeAny } from "zod";

import { useZodForm } from "../lib/hooks/useZodForm";
import { isNodeRef } from "../lib/nodes/ref-types";
import { GraphRunnerData, resolveNodeRef } from "../lib/nodes/run-graph";
import { FormHelper } from "./base/FormHelper";

export type ZodFormRef<T extends Record<string, unknown>> = {
  setValue: <P extends Path<T>>(name: P, value: PathValue<T, P>, options?: SetValueConfig) => void;
  getValue: <P extends Path<T>>(name: P) => PathValue<T, P>;
  getValues: () => T;
  reset: () => void;
};

const onSubmitEnter = (onSubmit: () => void) => (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    e.currentTarget.blur();
    onSubmit();
  }
};

type FieldOverride<T extends Record<string, unknown> = Record<string, unknown>> =
  | {
      label?: string;
      renderField?: (options: {
        register: () => UseFormRegisterReturn;
        error?: string;
        form: UseFormReturn<T>;
        name: Path<T>;
        onSubmit: () => void;
      }) => ReactNode;
      helper?: string;
    }
  | ((options: {
      register: () => UseFormRegisterReturn;
      error?: string;
      form: UseFormReturn<T>;
      name: Path<T>;
      onSubmit: () => void;
    }) => ReactNode);

export function ZodForm<T extends Record<string, unknown>>({
  formRef,
  defaultValues,
  schema,
  overrideFieldMap,
  onSubmit,
  saveButtonText = "Save",
}: {
  formRef?: React.Ref<ZodFormRef<T>>;
  defaultValues?: DefaultValues<T>;
  schema: z.ZodObject<{ [K in keyof T]: z.ZodType<T[K]> }, UnknownKeysParam, ZodTypeAny, T, T>;
  overrideFieldMap?: Partial<Record<Path<T>, FieldOverride<T>>>;
  onSubmit: (values: T) => void | Promise<void>;
  saveButtonText?: string | null;
}) {
  const form = useZodForm({ schema, defaultValues });
  useImperativeHandle(
    formRef,
    () => ({ setValue: form.setValue, getValue: form.getValues, getValues: form.getValues, reset: form.reset }),
    [form.getValues, form.reset, form.setValue],
  );
  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    form.reset(values);
  });

  const fields = Object.keys(schema.shape).map((key) => {
    let field = schema.shape[key];
    const error = form.formState.errors[key]?.message?.toString();
    const register = () => form.register(key as Path<T>);

    let fieldNode: ReactNode | undefined;
    let helper: string | undefined;
    let label = field?.description || startCase(key);
    if (overrideFieldMap && key in overrideFieldMap) {
      const override = overrideFieldMap[key as Path<T>]!;
      if (typeof override === "function")
        return (
          <Fragment key={key}>
            {override({ register, error, form, name: key as Path<T>, onSubmit: handleSubmit })}
          </Fragment>
        );
      fieldNode = override.renderField?.({ register, error, form, name: key as Path<T>, onSubmit: handleSubmit });
      helper = override.helper;
      label = override.label || label;
    }

    if (!fieldNode) {
      if (field instanceof z.ZodDefault) {
        field = field._def.innerType;
      }
      if (field instanceof z.ZodString) {
        fieldNode = <TextField.Root {...register()} onKeyDown={onSubmitEnter(handleSubmit)} />;
      } else if (field instanceof z.ZodBoolean) {
        return (
          <Stack key={key} css={{ gap: 1 }}>
            <label>
              <Flex css={{ alignItems: "center", gap: 8 }}>
                <Checkbox
                  {...register()}
                  defaultChecked={!!form.getValues(key as Path<T>)}
                  onCheckedChange={(e) => form.setValue(key as Path<T>, (e === true) as any, { shouldDirty: true })}
                />
                {label}
              </Flex>
            </label>
            <FormHelper helper={helper} error={error} />
          </Stack>
        );
      } else {
        console.error("Unsupported field type", key, field);
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

      {saveButtonText !== null && (
        <Flex css={{ justifyContent: "flex-end" }}>
          <Button disabled={!form.formState.isDirty} loading={form.formState.isSubmitting} onClick={handleSubmit}>
            {saveButtonText}
          </Button>
        </Flex>
      )}
    </Stack>
  );
}

export const createTextAreaField = (placeholder: string): FieldOverride<any> => ({
  renderField: ({ register, onSubmit }) => (
    <TextArea resize="vertical" placeholder={placeholder} {...register()} onKeyDown={onSubmitEnter(onSubmit)} />
  ),
});

function ResetRefButton({ onClick }: { onClick: () => void }) {
  return (
    <Tooltip content="Field is a reference, click to reset">
      <IconButton variant="soft" onClick={onClick}>
        <Link1Icon />
      </IconButton>
    </Tooltip>
  );
}

function TextAreaRefField({
  control,
  name,
  graphData,
  onSubmit,
}: {
  control: Control;
  name: string;
  graphData: GraphRunnerData;
  onSubmit: () => void;
}) {
  const { field } = useController({
    name,
    control,
    rules: { required: true },
  });
  const isRef = isNodeRef(field.value);
  const refNode = isRef ? graphData.nodes[field.value.nodeId] : undefined;
  const refValue = refNode ? resolveNodeRef(field.value, graphData.nodes) : undefined; // todo print if ref is broken?

  return (
    <Flex css={{ width: "100%" }}>
      <TextArea
        ref={field.ref}
        className={css({ flex: 1 })}
        resize="vertical"
        name={field.name}
        value={
          isRef
            ? `<ref node="${refNode?.typeId}" accessor="${JSON.stringify(field.value.accessor)}">\n${refValue}\n</ref>`
            : field.value
        }
        readOnly={isRef}
        onBlur={field.onBlur}
        onChange={field.onChange}
        onKeyDown={onSubmitEnter(onSubmit)}
      />

      {isRef ? <ResetRefButton onClick={() => field.onChange(refValue)} /> : null}
    </Flex>
  );
}

export const createTextAreaRefField = (graphData: GraphRunnerData): FieldOverride => ({
  // for string fields
  renderField: ({ form, name, onSubmit }) => (
    <TextAreaRefField control={form.control} name={name} graphData={graphData} onSubmit={onSubmit} />
  ),
});

function TextAreaRefArrayField({
  control,
  name,
  graphData,
}: {
  control: Control;
  name: string;
  graphData: GraphRunnerData;
}) {
  const { field } = useController({
    name,
    control,
    rules: { required: true },
  });
  const isRef = isNodeRef(field.value);
  const refNode = isRef ? graphData.nodes[field.value.nodeId] : undefined;
  const refValue = refNode ? resolveNodeRef(field.value, graphData.nodes) : undefined; // todo print if ref is broken?

  if (isRef) {
    return (
      <Flex css={{ width: "100%" }}>
        <TextArea
          ref={field.ref}
          className={css({ flex: 1 })}
          resize="vertical"
          name={field.name}
          value={`<ref node="${refNode?.typeId}" accessor="${JSON.stringify(field.value.accessor)}">\n${(refValue as string[]).join("\n")}\n</ref>`}
          readOnly
          onBlur={field.onBlur}
          onChange={field.onChange}
        />
        <ResetRefButton onClick={() => field.onChange(refValue)} />
      </Flex>
    );
  }
  return (
    <Stack css={{ width: "100%" }}>
      {field.value.map((value: string, index: number) => (
        <Flex key={index} css={{ width: "100%", mb: 8 }}>
          <TextArea className={css({ flex: 1 })} resize="vertical" name={`${field.name}.${index}`} value={value} />
          <IconButton
            variant="soft"
            onClick={() => {
              const newValues = [...field.value];
              newValues.splice(index, 1);
              field.onChange(newValues);
            }}
          >
            <TrashIcon />
          </IconButton>
        </Flex>
      ))}
      <Button onClick={() => field.onChange([...field.value, ""])}>Add Item</Button>
    </Stack>
  );
}

export const createTextAreaRefArrayField = (graphData: GraphRunnerData): FieldOverride => ({
  // for string array fields
  renderField: ({ form, name }: { form: UseFormReturn; name: string }) => (
    <TextAreaRefArrayField control={form.control} name={name} graphData={graphData} />
  ),
});
