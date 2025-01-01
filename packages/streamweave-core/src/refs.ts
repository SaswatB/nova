import { z } from "zod";

const swNodeRefSymbol = "swNodeRef" as unknown as symbol; // can't use Symbol() because it's not serializable
export type SwNodeRefAccessorSchema = "string" | "string[]" | "number" | "unknown";
export type SwNodeRefAccessorSchemaMap = {
  string: string;
  "string[]": string[];
  number: number;
  unknown: unknown;
};
export const SwNodeRefAccessorSchemaMap = {
  string: z.string(),
  "string[]": z.array(z.string()),
  number: z.number(),
  unknown: z.unknown(),
};
function ref<T extends SwNodeRefAccessorSchema>(schema: T) {
  return z.object({
    sym: z.literal(swNodeRefSymbol),
    nodeId: z.string(),
    accessor: z.object({
      type: z.union([z.literal("value"), z.literal("result")]),
      path: z.string(),
      schema: z.literal(schema),
    }),
  });
}
export type SwNodeRef<T extends SwNodeRefAccessorSchema> = z.infer<ReturnType<typeof ref<T>>>;
export function orRef<T extends z.ZodString | z.ZodArray<z.ZodString> | z.ZodNumber | z.ZodUnknown>(
  schema: T,
): z.ZodUnion<
  [
    T,
    ReturnType<
      typeof ref<
        | (T extends z.ZodString ? "string" : never)
        | (T extends z.ZodArray<z.ZodString> ? "string[]" : never)
        | (T extends z.ZodNumber ? "number" : never)
        | (T extends z.ZodUnknown ? "unknown" : never)
      >
    >,
  ]
> {
  let refType: SwNodeRefAccessorSchema;
  if (schema instanceof z.ZodString) {
    refType = "string";
  } else if (schema instanceof z.ZodArray && schema.element instanceof z.ZodString) {
    refType = "string[]";
  } else if (schema instanceof z.ZodNumber) {
    refType = "number";
  } else if (schema instanceof z.ZodUnknown) {
    refType = "unknown";
  } else {
    throw new Error("unexpected schema");
  }

  return z.union([schema, ref(refType) as any]);
}
export function isSwNodeRef<T extends SwNodeRefAccessorSchema>(
  value: SwNodeRef<T> | SwNodeRefAccessorSchemaMap[T],
): value is SwNodeRef<T> {
  return typeof value === "object" && value !== null && "sym" in value && value.sym === swNodeRefSymbol;
}

export type ResolveSwNodeRef<T> = T extends SwNodeRef<infer U> ? SwNodeRefAccessorSchemaMap[U] : T;
export type ResolveSwNodeRefs<T> = { [K in keyof T]: ResolveSwNodeRef<T[K]> };

export type CreateSwNodeRef = <T extends SwNodeRefAccessorSchema>(accessor: SwNodeRef<T>["accessor"]) => SwNodeRef<T>;

export function createSwNodeRef<T extends SwNodeRefAccessorSchema>(
  nodeId: string,
  accessor: SwNodeRef<T>["accessor"],
): SwNodeRef<T> {
  return { sym: swNodeRefSymbol, nodeId, accessor };
}
