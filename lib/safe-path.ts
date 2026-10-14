const INTERNAL_ORIGIN = "https://workflow.invalid";

export function isSafeInternalPath(path: string) {
  if (!path.startsWith("/") || path.includes("\\")) return false;

  try {
    return new URL(path, INTERNAL_ORIGIN).origin === INTERNAL_ORIGIN;
  } catch {
    return false;
  }
}
