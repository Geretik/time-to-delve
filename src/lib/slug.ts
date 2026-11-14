/** URL-safe ASCII slug of a Czech name: "Šermíř" → "sermir". Empty when nothing is left. */
export function slugify(name: string) {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Slug of a new class that isn't in `taken`: "barbar", then "barbar-2", "barbar-3"… */
export function uniqueClassSlug(name: string, taken: ReadonlySet<string>) {
  const base = slugify(name) || "classa";
  let slug = base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}
