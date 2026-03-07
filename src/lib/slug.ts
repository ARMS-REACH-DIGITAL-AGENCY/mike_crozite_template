export function toPlayerSlug(firstname: string | null | undefined, lastname: string | null | undefined): string {
  const base = `${firstname || ""} ${lastname || ""}`.trim() || "player";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "player";
}
