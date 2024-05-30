export type OmitUnion<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

export async function asyncToArray<T>(asyncIterable: AsyncIterable<T>) {
  const arr = [];
  for await (const i of asyncIterable) arr.push(i);
  return arr;
}

export function dirname(path: string) {
  const isWindows = path.includes("\\");
  const separator = isWindows ? "\\" : "/";
  return path.substring(0, path.lastIndexOf(separator));
}

export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}
