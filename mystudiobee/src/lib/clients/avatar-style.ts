const AVATAR_COLOR_CLASSES = ["bg-chart-1", "bg-chart-2", "bg-chart-5"];

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function getAvatarColorClass(name: string): string {
  const sum = name.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLOR_CLASSES[sum % AVATAR_COLOR_CLASSES.length];
}
