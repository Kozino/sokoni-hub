/**
 * Compact type scale.
 *
 * Every `fontSize` written in a style sheet is already a final, rendered size. `scaleFont` exists only for sizes that are
 * computed at run time (prices, avatar initials, ...): it maps a "large design size" onto the same compressive scale, so
 * small captions barely change while headings and prices shrink the most.
 */
const ANCHORS: [number, number][] = [[9, 9], [10, 10], [11, 10.5], [12, 11], [13, 11.5], [14, 12.5], [15, 13], [16, 13.5], [18, 15], [20, 16.5], [24, 19], [29, 22], [34, 25], [40, 29]];

const halfUp = (v: number) => Math.floor(v * 2 + 0.5) / 2;

export function scaleFont(size: number): number {
  if (size <= ANCHORS[0][0]) return size;
  const last = ANCHORS[ANCHORS.length - 1];
  if (size >= last[0]) return halfUp(size * 0.72);
  for (let i = 0; i < ANCHORS.length - 1; i += 1) {
    const [a, b] = ANCHORS[i];
    const [c, d] = ANCHORS[i + 1];
    if (size >= a && size <= c) return halfUp(b + ((d - b) * (size - a)) / (c - a));
  }
  return size;
}
