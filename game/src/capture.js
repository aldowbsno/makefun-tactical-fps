// Capture URLs select honest, playable initial states, never an outcome.
export function captureMode(search) {
  const query = new URLSearchParams(search);
  if (!query.has('shot')) return null;
  return ({ live: 'live', play: 'live', buy: 'buy', briefing: 'briefing', start: 'briefing' })[query.get('shot')] || 'briefing';
}

export function pixelDiversity(pixels, width, height, regions = [[0.08, 0.24, 0.92, 0.78]]) {
  const buckets = new Map();
  let samples = 0, min = 255, max = 0;
  for (const [left, top, right, bottom] of regions) {
    for (let y = Math.floor(top * height); y < bottom * height; y += Math.max(1, Math.floor(height / 100))) {
      for (let x = Math.floor(left * width); x < right * width; x += Math.max(1, Math.floor(width / 160))) {
        const i = (y * width + x) * 4;
        const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
        const bucket = (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3);
        buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
        const light = (r + g + b) / 3;
        min = Math.min(min, light); max = Math.max(max, light); samples++;
      }
    }
  }
  const dominant = samples ? Math.max(...buckets.values()) / samples : 1;
  return { colors: buckets.size, dominant, range: max - min, samples,
    visible: buckets.size >= 24 && dominant < 0.9 && max - min >= 30 };
}
