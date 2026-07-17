// Category values are exact-match lookup keys against profit_split_settings.category
// (see lib/profit-split/engine.ts, `settings.category === category`) and are stored
// as-is on documents.category — do not change these strings. CATEGORY_LABELS is the
// only thing meant to be edited when the user-facing name should differ from the key.
export const CATEGORIES = ["video", "web", "design", "retainer"] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  video: "Video Production",
  web: "Web",
  design: "Design",
  retainer: "Retainer",
};
