/* Карты этапов: сетка 13×13 ячеек.
   Легенда:  . пусто | B кирпич | S сталь | W вода | F лес | I лёд
   Нижняя середина (штаб, игрок) и верхние точки выхода противника
   принудительно расчищаются движком. */

export type EnemyKind = "basic" | "fast" | "power" | "armor";

const M1 = [
  ".............",
  ".BB.BB.BB.BB.",
  ".BB.BB.BB.BB.",
  ".............",
  ".BB.SBBS.BB..",
  ".....WW......",
  ".BB..WW..BB..",
  ".....WW....B.",
  ".BB.BB.BB.BB.",
  ".............",
  ".BB.BB.BB.B..",
  "....B..B.....",
  ".............",
];

const M2 = [
  "..F.......F..",
  ".BBB.BB.BBB..",
  ".....BB......",
  ".SS.......SS.",
  ".BB.FBBF.BB..",
  "....FBBF.....",
  ".BB.......BB.",
  "....BB.BB....",
  ".BB.BB.BB.BB.",
  ".............",
  ".B..BB.BB..B.",
  "....B..B.....",
  ".............",
];

const M3 = [
  ".............",
  ".SS.BB.BB.SS.",
  "....BB.BB....",
  ".BB......BB..",
  ".BB.IIII.BB..",
  "....IIII.....",
  ".BB.IIII.BBB.",
  "....IIII.....",
  ".BB.BB.BB.BB.",
  ".....SS......",
  ".BB.BB.BB.BB.",
  "....B..B.....",
  ".............",
];

const M4 = [
  ".F...SSS...F.",
  ".FF..BBB..FF.",
  ".....B.B.....",
  ".BBB.B.B.BBB.",
  ".....B.B.....",
  ".WW..B.B..WW.",
  ".WW.......WW.",
  ".....BBB.....",
  ".BB..B.B..BB.",
  ".....B.B.....",
  ".BB.BB.BB.BB.",
  "....B..B.....",
  ".............",
];

const M5 = [
  ".............",
  ".S.BB.BB.B.S.",
  ".....BB......",
  ".BB.S..S.BB..",
  ".BB...F..BB..",
  ".....FF......",
  ".SS.FFF..SS..",
  ".....FF......",
  ".BB...F..BB..",
  ".BB.S..S.BB..",
  ".....BB.BB...",
  "....B..B.....",
  ".............",
];

export const MAPS: string[][] = [M1, M2, M3, M4, M5];

/* Состав волны из 20 машин, зависит от номера этапа. */
export function buildWave(stage: number): EnemyKind[] {
  const s = Math.min(stage, 12);
  const armor = Math.min(6, Math.max(0, s - 1));
  const power = Math.min(6, 1 + Math.floor(s / 2));
  const fast = Math.min(8, 3 + Math.floor(s * 0.8));
  const basic = Math.max(2, 20 - armor - power - fast);
  const kinds: EnemyKind[] = [];
  const push = (k: EnemyKind, n: number) => { for (let i = 0; i < n; i++) kinds.push(k); };
  push("basic", basic);
  push("fast", fast);
  push("power", power);
  push("armor", armor);
  /* перемешивание детерминированным «тасованием», чтобы волна была живой */
  let seed = 1234 + stage * 77;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j], kinds[i]];
  }
  return kinds.slice(0, 20);
}

/* every 4th, 11th, 18th машина в очереди — «бонусная» (мигает красным) */
export const BONUS_INDEXES = new Set([3, 10, 17]);

export const ENEMY_STATS: Record<
  EnemyKind,
  { hp: number; speed: number; bullet: number; fireRate: number; score: number }
> = {
  basic: { hp: 1, speed: 52, bullet: 170, fireRate: 0.55, score: 100 },
  fast: { hp: 1, speed: 96, bullet: 190, fireRate: 0.7, score: 200 },
  power: { hp: 1, speed: 58, bullet: 260, fireRate: 1.25, score: 300 },
  armor: { hp: 4, speed: 44, bullet: 180, fireRate: 0.8, score: 400 },
};

/* -------- сложность -------- */
export type Difficulty = "easy" | "normal" | "hard";

export const DIFF: Record<
  Difficulty,
  { label: string; hint: string; speedMul: number; fireMul: number; spawnMul: number; lives: number }
> = {
  easy:   { label: "НОВОБРАНЕЦ", hint: "4 жизни, враги медленнее и ленивее", speedMul: 0.85, fireMul: 0.7, spawnMul: 1.3, lives: 4 },
  normal: { label: "СОЛДАТ", hint: "классика: 3 жизни, честный бой", speedMul: 1, fireMul: 1, spawnMul: 1, lives: 3 },
  hard:   { label: "ВЕТЕРАН", hint: "2 жизни, враги быстрые и злые", speedMul: 1.12, fireMul: 1.3, spawnMul: 0.8, lives: 2 },
};

/* -------- ночные этапы: каждый 3-й из пяти -------- */
export const isNight = (stage: number) => ((stage - 1) % 5) === 2;
