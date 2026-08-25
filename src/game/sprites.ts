/* Пиксель-арт чихуахуа Топы, нарисованный вручную символами. 16×16 «юнитов»,
   каждый юнит = 2px на игровом поле (итого 32×32px). */

export const CHI_PAL: Record<string, string> = {
  T: "#d9a05b", // рыжевина
  D: "#a86f35", // тёмная рыжевина
  Y: "#eec488", // светлая рыжевина
  P: "#e8a3a3", // розовый ушей
  W: "#f7f0e1", // белый
  K: "#20150c", // тёмный
  R: "#c23b2e", // ошейник
  G: "#e8c84a", // жетон
  N: "#3a281a", // нос/глаза
};

export const CHI_PAL_DEAD: Record<string, string> = {
  ...CHI_PAL,
  T: "#8f8d84",
  D: "#6e6c64",
  Y: "#b3b1a7",
  P: "#a78b8b",
  R: "#7c3a33",
  G: "#9a9168",
};

const CHI_BODY = [
  "..DD........DD..",
  ".DTTD......DTTD.",
  ".DPTD......DTPD.",
  ".DPTTTTTTTTTTPD.",
  "..DTTTTTTTTTTD..",
  "..TTNTTTTTTNTT..",
  "..TTTWWWWWWTTT..",
  "...TTWWNNWWTT...",
  "....RRRRRRRR....",
  "...TTTTGGTTTT...",
  "...TTTWWWWTTT...",
  "..TTTTWWWWTTTT..",
  "..TTTYWWWWYTTT..",
  "..TT.TTTTTT.TT..",
  "..WW.TTTTTT.WW..",
  "................",
];

/* хвост: два кадра покачивания, рисуется поверх справа */
const TAIL_A = ["....", "..TD", ".TD.", ".D.."];
const TAIL_B = ["....", ".TD.", "..TD", "..D."];

/* глазки для моргания: закрываются полоской цвета T */
const EYE_ROWS = [5];
const EYE_COLS = [4, 11];

export type ChiMood = "calm" | "danger" | "happy";

function drawMap(
  ctx: CanvasRenderingContext2D,
  map: string[],
  x: number,
  y: number,
  u: number,
  pal: Record<string, string>,
) {
  for (let r = 0; r < map.length; r++) {
    const row = map[r];
    for (let c = 0; c < row.length; c++) {
      const ch = row[c];
      if (ch === "." || ch === " ") continue;
      const col = pal[ch];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x + c * u), Math.round(y + r * u), Math.ceil(u), Math.ceil(u));
    }
  }
}

export interface ChiOpts {
  alive: boolean;
  t: number; // игровое время, сек
  u?: number; // размер юнита (по умолчанию 2)
  mood?: ChiMood;
}

/** Рисует Топу в прямоугольнике 16u × 16u с координатой (x, y). */
export function drawChihuahua(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  { alive, t, u = 2, mood = "calm" }: ChiOpts,
) {
  const pal = alive ? CHI_PAL : CHI_PAL_DEAD;

  /* тревога: мелкая дрожь всем телом */
  let dx = 0, dy = 0;
  if (alive && mood === "danger") {
    dx = Math.round(Math.sin(t * 42) * 1);
    dy = Math.round(Math.cos(t * 37) * 0.6);
  }

  drawMap(ctx, CHI_BODY, x + dx, y + dy, u, pal);

  /* хвостик: в радости виляет вдвое быстрее */
  const wagSpeed = alive && mood === "happy" ? 13 : 4;
  const wag = Math.floor(t * wagSpeed) % 2 === 0 ? TAIL_A : TAIL_B;
  drawMap(ctx, wag, x + 12 * u + dx, y + 9 * u + dy, u, pal);

  if (alive) {
    /* моргание раз в ~3.2с (в тревоге — чаще) */
    const period = mood === "danger" ? 1.4 : 3.2;
    const blink = t % period < 0.12;
    if (blink) {
      ctx.fillStyle = pal.T;
      for (const er of EYE_ROWS)
        for (const ec of EYE_COLS)
          ctx.fillRect(x + ec * u + dx, y + er * u + dy, u, u);
    }
    /* в тревоге — расширенные зрачки-точки поверх */
    if (mood === "danger" && !blink) {
      ctx.fillStyle = pal.K;
      for (const ec of EYE_COLS)
        ctx.fillRect(x + ec * u + dx, y + 5 * u + dy, Math.ceil(u * 0.7), Math.ceil(u * 0.7));
    }
    /* в радости — розовые щёчки и высунутый язычок */
    if (mood === "happy") {
      ctx.fillStyle = "#e8a3a3";
      ctx.fillRect(x + 3 * u, y + 6 * u, u, u);
      ctx.fillRect(x + 12 * u, y + 6 * u, u, u);
      if (Math.floor(t * 6) % 2 === 0) ctx.fillRect(x + 7 * u, y + 7 * u, 2 * u, u);
    }
  } else {
    /* крестики вместо глаз + высунутый язычок */
    ctx.fillStyle = pal.K;
    ctx.fillRect(x + 4 * u, y + 5 * u, u, u);
    ctx.fillRect(x + 11 * u, y + 5 * u, u, u);
    ctx.fillStyle = "#e8a3a3";
    ctx.fillRect(x + 7 * u, y + 7 * u, 2 * u, u);
    /* душа-призрак, покачивается */
    const gy = y - 3 * u + Math.sin(t * 2.2) * 2;
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "#e8ecdf";
    ctx.fillRect(x + 11 * u, gy, 4 * u, 3 * u);
    ctx.fillRect(x + 12 * u, gy - u, 2 * u, u);
    ctx.fillStyle = "#3c4436";
    ctx.fillRect(x + 12 * u, gy + u, u * 0.8, u * 0.8);
    ctx.fillRect(x + 14 * u, gy + u, u * 0.8, u * 0.8);
    ctx.globalAlpha = 1;
  }
}

/** Рисует маленькое сердечко (для победного экрана). */
export function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color = "#ff5b45") {
  ctx.fillStyle = color;
  ctx.fillRect(x, y + s, s, s * 2);
  ctx.fillRect(x + s * 3, y + s, s, s * 2);
  ctx.fillRect(x, y, s * 4, s);
  ctx.fillRect(x + s, y - 0, s * 2, s * 4);
  ctx.fillRect(x + s, y + 4 * s, s * 2, s);
  ctx.fillRect(x + s * 1.5, y + 5 * s, s, s);
}
