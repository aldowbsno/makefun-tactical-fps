// Tidal-industrial palette: deep blue concrete, oxidized teal cover, warm relay accents.
export const PALETTE = {
  canvas: '#101e2c',
  surface: '#26434e',
  hairline: '#337078',
  ink: '#e4e8df',
  muted: '#7cbec7',
  accent: '#ffc46b',
};

export function shade(name) {
  return PALETTE[name];
}
