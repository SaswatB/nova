import { Fragment, ReactNode, useImperativeHandle } from "react";
import { Control, SetValueConfig, useController, UseFormRegisterReturn, UseFormReturn } from "react-hook-form";
import { Link1Icon, TrashIcon } from "@radix-ui/react-icons";
import { Button, IconButton, TextArea, TextField, Tooltip } from "@radix-ui/themes";
import { startCase } from "lodash";
import { css } from "styled-system/css";
import { Flex, Stack } from "styled-system/jsx";
import { z } from "zod";

import { useZodForm } from "../lib/hooks/useZodForm";
import { isNodeRef } from "../lib/prototype/nodes/ref-types";
import { GraphRunnerData, resolveNodeRefAccessor } from "../lib/prototype/nodes/run-graph";
import { FormHelper } from "./base/FormHelper";

export function ZodForm<T extends z.ZodObject<any>>({
  formRef,
  defaultValues,
  schema,
  overrideFieldMap,
  onSubmit,
}: {
  formRef?: React.RefObject<{
    reset: () => void;
    setValue: (name: keyof z.infer<T>, value: unknown, options?: SetValueConfig) => void;
  }>;
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
            name: keyof z.infer<T>;
          }) => ReactNode;
          helper?: string;
        }
      | ((options: {
          register: () => UseFormRegisterReturn;
          error?: string;
          form: UseFormReturn<z.infer<T>>;
          name: keyof z.infer<T>;
        }) => ReactNode)
    >
  >;
  onSubmit: (values: z.infer<T>) => void | Promise<void>;
}) {
  const form = useZodForm({ schema, defaultValues } as any);
  useImperativeHandle(formRef, () => ({
    setValue: form.setValue as any,
    reset: form.reset,
  }));
  const handleSubmit = form.handleSubmit(async (values) => {
    await onSubmit(values);
    form.reset(values);
  });

  const fields = Object.keys(schema.shape).map((key) => {
    let field = schema.shape[key];
    const error = form.formState.errors[key]?.message?.toString();
    const register = () => form.register(key);

    let fieldNode: ReactNode | undefined;
    let helper: string | undefined;
    let label = field.description || startCase(key);
    if (overrideFieldMap && key in overrideFieldMap) {
      const override = overrideFieldMap[key as keyof z.infer<T>]!;
      if (typeof override === "function")
        return <Fragment key={key}>{override({ register, error, form, name: key })}</Fragment>;
      fieldNode = override.renderField?.({ register, error, form, name: key });
      helper = override.helper;
      label = override.label || label;
    }

    if (!fieldNode) {
      // if (
      //   // remove union type for refs
      //   field instanceof z.ZodUnion &&
      //   isArray(field.options) &&
      //   field.options.length === 2 &&
      //   field.options[1] instanceof z.ZodObject &&
      //   field.options[1].shape.sym instanceof z.ZodLiteral &&
      //   field.options[1].shape.sym.value === nnodeRefSymbol
      // ) {
      //   field = field.options[0];
      // }
      if (field instanceof z.ZodString) {
        fieldNode = <TextField.Root {...register()} />;
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

      <Flex css={{ justifyContent: "flex-end" }}>
        <Button disabled={!form.formState.isDirty} loading={form.formState.isSubmitting} onClick={handleSubmit}>
          Save
        </Button>
      </Flex>
    </Stack>
  );
}

export const textAreaField = {
  renderField: ({ register }: { register: () => UseFormRegisterReturn }) => (
    <TextArea resize="vertical" {...register()} />
  ),
};

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
  const refValue = refNode ? resolveNodeRefAccessor(field.value, refNode) : undefined; // todo print if ref is broken?

  return (
    <Flex css={{ width: "100%" }}>
      <TextArea
        ref={field.ref}
        className={css({ flex: 1 })}
        resize="vertical"
        name={field.name}
        value={
          isRef
            ? `<ref node="${refNode?.value?.type}" accessor="${JSON.stringify(field.value.accessor)}">\n${refValue}\n</ref>`
            : field.value
        }
        readOnly={isRef}
        onBlur={field.onBlur}
        onChange={field.onChange}
      />

      {isRef ? <ResetRefButton onClick={() => field.onChange(refValue)} /> : null}
    </Flex>
  );
}

export const createTextAreaRefField = (graphData: GraphRunnerData) => ({
  // for string fields
  renderField: ({ form, name }: { form: UseFormReturn; name: string }) => (
    <TextAreaRefField control={form.control} name={name} graphData={graphData} />
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
  const refValue = refNode ? resolveNodeRefAccessor(field.value, refNode) : undefined; // todo print if ref is broken?

  if (isRef) {
    return (
      <Flex css={{ width: "100%" }}>
        <TextArea
          ref={field.ref}
          className={css({ flex: 1 })}
          resize="vertical"
          name={field.name}
          value={`<ref node="${refNode?.value?.type}" accessor="${JSON.stringify(field.value.accessor)}">\n${(refValue as string[]).join("\n")}\n</ref>`}
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

export const createTextAreaRefArrayField = (graphData: GraphRunnerData) => ({
  // for string array fields
  renderField: ({ form, name }: { form: UseFormReturn; name: string }) => (
    <TextAreaRefArrayField control={form.control} name={name} graphData={graphData} />
  ),
});
