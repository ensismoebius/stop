/**
 * Céu do pódio, calculado a partir da hora do relógio do servidor — nunca
 * uma imagem estática. Interpola linearmente (RGB) entre quadros-chave ao
 * longo das 24h, então a passagem de manhã para tarde para noite é
 * contínua, não uma troca abrupta a cada hora cheia.
 */
const KEYFRAMES = [
  { h: 0, top: [4, 6, 25], bottom: [16, 12, 33], glow: [40, 30, 70], stars: 1 },
  { h: 5, top: [10, 16, 46], bottom: [40, 34, 70], glow: [90, 70, 110], stars: 0.6 },
  { h: 6.5, top: [58, 76, 130], bottom: [235, 150, 100], glow: [255, 205, 140], stars: 0 },
  { h: 9, top: [70, 145, 210], bottom: [190, 220, 245], glow: [255, 245, 210], stars: 0 },
  { h: 13, top: [45, 125, 210], bottom: [155, 205, 235], glow: [255, 255, 255], stars: 0 },
  { h: 16.5, top: [60, 115, 190], bottom: [235, 190, 115], glow: [255, 220, 150], stars: 0 },
  { h: 18.5, top: [70, 60, 115], bottom: [225, 105, 75], glow: [255, 160, 110], stars: 0.15 },
  { h: 20, top: [30, 25, 70], bottom: [80, 50, 90], glow: [150, 80, 110], stars: 0.55 },
  { h: 22, top: [8, 8, 26], bottom: [30, 22, 50], glow: [55, 40, 80], stars: 0.9 },
  { h: 24, top: [4, 6, 25], bottom: [16, 12, 33], glow: [40, 30, 70], stars: 1 },
];

/** Interpolacao linear simples entre dois numeros. */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Interpola linearmente duas cores RGB e devolve como string `rgb(...)`. */
function lerpRgb(a, b, t) {
  return `rgb(${a.map((channel, index) => Math.round(lerp(channel, b[index], t))).join(", ")})`;
}

/**
 * @param {Date} date Hora local do relógio já sincronizado com o servidor
 *   (ver `useServerClock`) — nunca o relógio do próprio navegador puro.
 * @returns {{ top: string, bottom: string, glow: string, stars: number }}
 */
export function skyForDate(date) {
  const h = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
  let a = KEYFRAMES[0];
  let b = KEYFRAMES[1];
  for (let i = 0; i < KEYFRAMES.length - 1; i += 1) {
    if (h >= KEYFRAMES[i].h && h <= KEYFRAMES[i + 1].h) {
      a = KEYFRAMES[i];
      b = KEYFRAMES[i + 1];
      break;
    }
  }
  const t = (h - a.h) / (b.h - a.h || 1);
  return {
    top: lerpRgb(a.top, b.top, t),
    bottom: lerpRgb(a.bottom, b.bottom, t),
    glow: lerpRgb(a.glow, b.glow, t),
    stars: lerp(a.stars, b.stars, t),
  };
}

export default skyForDate;
