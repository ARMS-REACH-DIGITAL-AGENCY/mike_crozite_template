export function toPlayerSlug(firstname: string | null | undefined, lastname: string | null | undefined): string {
  const base = `${firstname || ""} ${lastname || ""}`.trim() || "player";
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "player";
}

export function toSlugFromDisplay(display: string | null | undefined): string {
  const cleaned = (display || "").replace(/-/g, " ").trim();
  const parts = cleaned.split(/\s+/);
  const firstname = parts[0] || "";
  const lastname = parts.slice(1).join(" ");
  return toPlayerSlug(firstname, lastname);
}
