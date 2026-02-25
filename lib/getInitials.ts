// app/lib/getInitials.ts
export function getInitials(name?: string | null) {
  if (!name) return "AP"; // default initials if name missing
  const parts = name.trim().split(" ");
  // Take first letters of first two words
  return parts
    .map((p) => p[0].toUpperCase())
    .slice(0, 2)
    .join("");
}