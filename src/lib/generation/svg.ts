/** Small deterministic helpers for inspecting generated SVG artwork. */

/** Counts distinct fill/stroke colors (hex or rgb) in an SVG source. */
export function countSvgColors(svg: string): number {
  const colors = new Set<string>();
  for (const m of svg.matchAll(
    /(?:fill|stroke)\s*[:=]\s*["']?\s*(#[0-9a-fA-F]{3,8}|rgb\([^)]*\))/g
  )) {
    const value = m[1].toLowerCase();
    if (value === "#fff" || value === "#ffffff") continue; // background/paper
    colors.add(normalizeHex(value));
  }
  return colors.size;
}

function normalizeHex(color: string): string {
  if (color.startsWith("#") && color.length === 4) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
  }
  return color;
}

/** Extracts pixel dimensions from an SVG viewBox, if present. */
export function svgDimensions(
  svg: string
): { width: number; height: number } | null {
  const m = svg.match(
    /viewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)\s*["']/
  );
  if (!m) return null;
  return { width: Math.round(parseFloat(m[1])), height: Math.round(parseFloat(m[2])) };
}
