// UI is sized in rem, but projected labels and the distance ruler are placed
// in CSS pixels. Convert the UI spacing only, never the camera/planet scale.
export function screenSpaceUI(rootFontSize, { height, headerBottom, footerTop }) {
  const pixels = Number.parseFloat(rootFontSize);
  const scale = Number.isFinite(pixels) && pixels > 0 ? pixels / 16 : 1;
  return {
    scale,
    labelTop: headerBottom + 18 * scale,
    labelBottom: Math.min(height, footerTop) - 18 * scale,
    labelGapX: 57 * scale,
    labelGapY: 20 * scale,
    rulerTarget: 100 * scale,
  };
}
