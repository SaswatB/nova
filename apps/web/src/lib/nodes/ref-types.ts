import { match, P } from "ts-pattern";
import { z } from "zod";

export const nnodeRefSymbol = "nnodeRef" as unknown as symbol; // can't use Symbol() because it's not serializable
export type NNodeRefAccessorSchema = "string" | "string[]" | "number" | "unknown";
export type NNodeRefAccessorSchemaMap = {
  string: string;
  "string[]": string[];
  number: number;
  unknown: unknown;
};
export const NNodeRefAccessorSchemaMap = {
  string: z.string(),
  "string[]": z.array(z.string()),
  number: z.number(),
  unknown: z.unknown(),
};
function ref<T extends NNodeRefAccessorSchema>(schema: T) {
  return z.object({
    sym: z.literal(nnodeRefSymbol),
    nodeId: z.string(),
    accessor: z.object({
      type: z.union([z.literal("value"), z.literal("result")]),
      path: z.string(),
      schema: z.literal(schema),
    }),
  });
}
export type NNodeRef<T extends NNodeRefAccessorSchema> = z.infer<ReturnType<typeof ref<T>>>;
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
  return z.union([
    schema,
    ref(
      match(schema)
        .with(P.instanceOf(z.ZodString), () => "string" as const)
        .with(P.instanceOf(z.ZodArray).and({ element: P.instanceOf(z.ZodString) }), () => "string[]" as const)
        .with(P.instanceOf(z.ZodNumber), () => "number" as const)
        .with(P.instanceOf(z.ZodUnknown), () => "unknown" as const)
        .otherwise(() => {
          throw new Error("unexpected schema");
        }),
    ) as any,
  ]);
}
export function isNodeRef(value: unknown): value is NNodeRef<NNodeRefAccessorSchema> {
  return typeof value === "object" && value !== null && "sym" in value && value.sym === nnodeRefSymbol;
}

export type ResolveRef<T> = T extends NNodeRef<infer U> ? NNodeRefAccessorSchemaMap[U] : T;
export type ResolveRefs<T> = {
  [K in keyof T]: ResolveRef<T[K]>;
};
