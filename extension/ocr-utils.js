export function cropBounds(region, viewport, image) {
  if (![region.x, region.y, region.width, region.height, viewport.width, viewport.height, image.width, image.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0 || image.width <= 0 || image.height <= 0 || region.width <= 0 || region.height <= 0) throw new Error('Invalid image selection.');
  const sx = image.width / viewport.width, sy = image.height / viewport.height;
  const x = Math.max(0, Math.round(region.x * sx)), y = Math.max(0, Math.round(region.y * sy));
  const width = Math.min(image.width, Math.round((region.x + region.width) * sx)) - x, height = Math.min(image.height, Math.round((region.y + region.height) * sy)) - y;
  if (width <= 0 || height <= 0) throw new Error('Selection is outside the image.');
  return { x, y, width, height };
}
export function cleanText(text) { return text.replace(/\r/g, '').trim(); }
