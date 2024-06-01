export function formatError(err: unknown): string {
  if (err instanceof Error) {
    if (["{", "["].some((c) => err.message.trim().startsWith(c))) {
      try {
        const json = JSON.parse(err.message);
        const message =
          json?.message || json?.[0]?.message || json?.error?.message;
        if (typeof message === "string") {
          return message;
        }
      } catch {}
    }
    return err.message;
  }
  if (typeof err === "string") {
    return err;
  }
  return "An error occurred";
}
