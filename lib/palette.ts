export const BRACKET_COLORS = [
  "#e23d3d",
  "#2f6fed",
  "#e2a325",
  "#1f9d6a",
  "#8b5cf6",
  "#ef6a2f",
  "#14919b",
  "#d63d7a",
  "#4f7d3a",
  "#c45c26",
  "#3a4fbf",
  "#b08900",
  "#0f766e",
  "#a33b5a",
  "#5b4b8a",
  "#6b7c1a",
] as const;

const CLUB_DOTS = [
  "#f0c14a",
  "#7eb6ff",
  "#ff8b7b",
  "#7ddea2",
  "#d7b0ff",
  "#ffc07a",
  "#8ee7e1",
  "#ff9ec8",
  "#d5e27a",
  "#c5d0e6",
] as const;

export function bracketColor(index: number): string {
  return BRACKET_COLORS[index % BRACKET_COLORS.length] ?? BRACKET_COLORS[0];
}

export function clubColor(club: string): string {
  const key = club.trim().toLocaleLowerCase();
  if (!key) return "#8b97ad";
  let hash = 0;
  for (let i = 0; i < key.length; i++)
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return CLUB_DOTS[hash % CLUB_DOTS.length] ?? CLUB_DOTS[0];
}

function channel(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const parsed = Number.parseInt(value, 16);
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

export function textOn(hex: string): string {
  const [red, green, blue] = channel(hex);
  const linear = [red, green, blue].map((part) => {
    const c = part / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
  return luminance > 0.42 ? "#1a1204" : "#fffaf2";
}

export function mix(
  hex: string,
  target: "#ffffff" | "#000000",
  amount: number,
): string {
  const base = channel(hex);
  const toward = target === "#ffffff" ? [255, 255, 255] : [0, 0, 0];
  const mixed = base.map((part, index) =>
    Math.round(part + (toward[index]! - part) * amount),
  );
  return `rgb(${mixed[0]}, ${mixed[1]}, ${mixed[2]})`;
}
