import { chip } from "./audio";
import { MAPS, buildWave, BONUS_INDEXES, ENEMY_STATS, type EnemyKind } from "./levels";
import { drawChihuahua } from "./sprites";

/* ============================== типы ============================== */

export type GameState =
  | "menu"
  | "intermission"
  | "playing"
  | "paused"
  | "stageclear"
  | "gameover";

export interface HudSnapshot {
  state: GameState;
  score: number;
  hi: number;
  lives: number;
  stage: number;
  enemiesLeft: number;
  power: number;
  muted: boolean;
  frozenT: number;
  shovelT: number;
  shieldT: number;
  killed: Record<EnemyKind, number>;
  gameOverReason: "lives" | "base" | null;
  newRecord: boolean;
}

type Dir = 0 | 1 | 2 | 3; // вверх, вправо, вниз, влево
type PowerKind = "star" | "tank" | "helmet" | "timer" | "grenade" | "shovel";

interface Tank {
  id: number;
  isPlayer: boolean;
  kind: EnemyKind | "player";
  x: number;
  y: number;
  dir: Dir;
  vx: number;
  vy: number;
  speed: number;
  hp: number;
  alive: boolean;
  spawnT: number;
  shieldT: number;
  flashT: number;
  cooldown: number;
  aiT: number;
  tread: number;
  bonus: boolean;
}

interface Bullet {
  x: number;
  y: number;
  dir: Dir;
  speed: number;
  power: number;
  fromPlayer: boolean;
  dead: boolean;
}

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string; grav: number;
}
interface Ring { x: number; y: number; r: number; vr: number; life: number; maxLife: number; color: string }
interface Popup { x: number; y: number; text: string; life: number; maxLife: number; color: string; big: boolean }

/* ============================ константы ============================ */

const G = 26;             // подклетки
const TS = 16;            // размер подклетки
const FIELD = G * TS;     // 416
const TANK = 32;          // размер танка
const STEP = 1 / 60;

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

const T_EMPTY = 0, T_BRICK = 1, T_STEEL = 2, T_WATER = 3, T_FOREST = 4, T_ICE = 5;

const BASE_X = 192, BASE_Y = 384;            // штаб-чихуахуа, 32×32
const RING: Array<[number, number]> = [
  [11, 23], [12, 23], [13, 23], [14, 23],
  [11, 24], [11, 25], [14, 24], [14, 25],
];
const SPAWNS: Array<[number, number]> = [[0, 0], [192, 0], [384, 0]];
const PLAYER_SPAWN: [number, number] = [128, 384];

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const rnd = Math.random;

/* ============================== движок ============================== */

export class Engine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private cb: (h: HudSnapshot) => void;

  state: GameState = "menu";
  private grid = new Uint8Array(G * G);
  private tanks: Tank[] = [];
  private bullets: Bullet[] = [];
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private popups: Popup[] = [];
  private powerup: { x: number; y: number; kind: PowerKind; t: number } | null = null;

  private queue: EnemyKind[] = [];
  private spawnT = 0;
  private spawnSlot = 0;
  private spawnCount = 0;

  stage = 1;
  private score = 0;
  private hi = 0;
  private lives = 3;
  private playerPower = 0;
  private kills: Record<EnemyKind, number> = { basic: 0, fast: 0, power: 0, armor: 0 };
  private gameOverReason: "lives" | "base" | null = null;
  private newRecord = false;

  private baseAlive = true;
  private freezeT = 0;
  private shovelT = 0;
  private interT = 0;
  private overT = -1;
  private clearT = 0;
  private respawnT = -1;

  private shake = 0;
  private flashT = 0;
  private hitStop = 0;
  private time = 0;
  private lastIntSec = "";

  private keys = new Set<string>();
  private touchDir: Dir | null = null;
  private touchFire = false;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private destroyed = false;
  private nextId = 1;
  private player: Tank | null = null;

  constructor(canvas: HTMLCanvasElement, cb: (h: HudSnapshot) => void) {
    this.canvas = canvas;
    this.cb = cb;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    canvas.width = FIELD;
    canvas.height = FIELD;
    try { this.hi = Number(localStorage.getItem("sp_hi") ?? 0) || 0; } catch { this.hi = 0; }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);

    this.loadStageMap();
    this.pushHud();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    chip.hum(false);
  }

  /* ------------------------- ввод ------------------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    chip.unlock();
    const c = e.code;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(c)) e.preventDefault();
    if (e.repeat) { this.keys.add(c); return; }
    this.keys.add(c);

    if (c === "KeyM") { chip.setMuted(!chip.muted); this.pushHud(); }
    if ((c === "KeyP" || c === "Escape") && (this.state === "playing" || this.state === "paused")) {
      this.togglePause();
    }
    if (c === "Enter" || c === "Space") {
      if (this.state === "menu") this.startGame();
      else if (this.state === "stageclear") this.nextStage();
      else if (this.state === "gameover") this.startGame();
    }
  };

  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private onBlur = () => { if (this.state === "playing") this.togglePause(); };

  setTouchDir(d: Dir | null) { this.touchDir = d; chip.unlock(); }
  setTouchFire(f: boolean) { this.touchFire = f; chip.unlock(); }

  togglePause() {
    if (this.state === "playing") {
      this.state = "paused";
      chip.hum(false);
      chip.uiMove();
    } else if (this.state === "paused") {
      this.state = "playing";
      this.last = performance.now();
      chip.uiMove();
    }
    this.pushHud();
  }

  startGame() {
    this.score = 0;
    this.lives = 3;
    this.stage = 1;
    this.playerPower = 0;
    this.gameOverReason = null;
    this.newRecord = false;
    chip.unlock();
    this.beginStage();
  }

  nextStage() {
    this.stage++;
    this.beginStage();
  }

  private beginStage() {
    this.state = "intermission";
    this.interT = 1.7;
    chip.stageStart();
    this.pushHud();
  }

  /* ------------------------- карта ------------------------- */

  private loadStageMap() {
    const map = MAPS[(this.stage - 1) % MAPS.length];
    this.grid.fill(T_EMPTY);
    for (let cy = 0; cy < 13; cy++) {
      const row = map[cy] ?? "";
      for (let cx = 0; cx < 13; cx++) {
        const ch = row[cx] ?? ".";
        let t = T_EMPTY;
        if (ch === "B") t = T_BRICK;
        else if (ch === "S") t = T_STEEL;
        else if (ch === "W") t = T_WATER;
        else if (ch === "F") t = T_FOREST;
        else if (ch === "I") t = T_ICE;
        if (t !== T_EMPTY) {
          const sx = cx * 2, sy = cy * 2;
          this.grid[sy * G + sx] = t;
          this.grid[sy * G + sx + 1] = t;
          this.grid[(sy + 1) * G + sx] = t;
          this.grid[(sy + 1) * G + sx + 1] = t;
        }
      }
    }
    /* расчистка: верхний ряд (выходы врагов), низ под игрока и штаб */
    for (let x = 0; x < G; x++) this.grid[x] = T_EMPTY;
    for (let cx = 4; cx <= 8; cx++)
      for (let sy = 24; sy <= 25; sy++)
        for (let sx = cx * 2; sx <= cx * 2 + 1; sx++) this.grid[sy * G + sx] = T_EMPTY;
    /* крепость штаба */
    for (const [rx, ry] of RING) this.grid[ry * G + rx] = T_BRICK;
  }

  private tileAt(px: number, py: number): number {
    const cx = clamp(Math.floor(px / TS), 0, G - 1);
    const cy = clamp(Math.floor(py / TS), 0, G - 1);
    return this.grid[cy * G + cx];
  }

  private rectSolid(x: number, y: number, self: Tank | null): boolean {
    const x0 = Math.floor(x / TS), x1 = Math.floor((x + TANK - 0.01) / TS);
    const y0 = Math.floor(y / TS), y1 = Math.floor((y + TANK - 0.01) / TS);
    if (x0 < 0 || y0 < 0 || x1 >= G || y1 >= G) return true;
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const t = this.grid[cy * G + cx];
        if (t === T_BRICK || t === T_STEEL || t === T_WATER) return true;
      }
    /* штаб неприкосновенен для колёс */
    if (x < BASE_X + TANK && x + TANK > BASE_X && y < BASE_Y + TANK && y + TANK > BASE_Y) return true;
    for (const o of this.tanks) {
      if (o === self || !o.alive || o.spawnT > 0.35) continue;
      if (x < o.x + TANK && x + TANK > o.x && y < o.y + TANK && y + TANK > o.y) return true;
    }
    return false;
  }

  /* ------------------------- цикл ------------------------- */

  private loop = (t: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = Math.min((t - this.last) / 1000, 0.12);
    this.last = t;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.render();
      return;
    }
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 6) {
      this.update(STEP);
      this.acc -= STEP;
      n++;
    }
    this.render();
  };

  private update(dt: number) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 26);
    this.flashT = Math.max(0, this.flashT - dt * 2.2);

    /* эффекты живут во всех состояниях */
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.grav * dt;
      p.vx *= 1 - 2.2 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    for (const r of this.rings) { r.life -= dt; r.r += r.vr * dt; }
    this.rings = this.rings.filter((r) => r.life > 0);
    for (const p of this.popups) { p.life -= dt; }
    this.popups = this.popups.filter((p) => p.life > 0);

    if (this.state === "intermission") {
      this.interT -= dt;
      if (this.interT <= 0) this.setupStage();
      return;
    }
    if (this.state === "gameover") {
      if (this.overT > 0) {
        this.overT -= dt;
        if (this.overT <= 0) {
          this.overT = -1;
          this.state = "gameover";
          chip.gameOverSting();
          this.saveHi();
          this.pushHud();
        }
      }
      return;
    }
    if (this.state === "stageclear") {
      this.clearT += dt;
      if (this.clearT > 9) this.nextStage();
      return;
    }
    if (this.state !== "playing") return;

    /* -------- таймеры бонусов -------- */
    if (this.freezeT > 0) this.freezeT = Math.max(0, this.freezeT - dt);
    if (this.shovelT > 0) {
      this.shovelT = Math.max(0, this.shovelT - dt);
      if (this.shovelT === 0) {
        for (const [rx, ry] of RING) this.grid[ry * G + rx] = T_BRICK;
        chip.brickHit();
      }
    }
    if (this.powerup) {
      this.powerup.t -= dt;
      if (this.powerup.t <= 0) this.powerup = null;
    }
    if (this.respawnT > 0) {
      this.respawnT -= dt;
      if (this.respawnT <= 0) { this.respawnT = -1; this.spawnPlayer(); }
    }

    /* -------- подкрепления врагов -------- */
    const aliveEnemies = this.tanks.filter((t) => !t.isPlayer && t.alive).length;
    if (this.queue.length > 0 && aliveEnemies < 4) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) this.spawnEnemy();
    }

    /* -------- танки -------- */
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (t.spawnT > 0) { t.spawnT -= dt; continue; }
      t.cooldown = Math.max(0, t.cooldown - dt);
      t.flashT = Math.max(0, t.flashT - dt);
      t.shieldT = Math.max(0, t.shieldT - dt);
      if (t.isPlayer) this.drivePlayer(t, dt);
      else this.driveEnemy(t, dt);
    }
    this.tanks = this.tanks.filter((t) => t.alive || t.spawnT > -10);
    this.tanks = this.tanks.filter((t) => t.alive);

    /* -------- пули -------- */
    for (const b of this.bullets) this.moveBullet(b, dt);
    this.collideBullets();
    this.bullets = this.bullets.filter((b) => !b.dead);

    /* -------- подбор бонуса -------- */
    const pl = this.player;
    if (this.powerup && pl && pl.alive) {
      if (
        pl.x < this.powerup.x + TANK && pl.x + TANK > this.powerup.x &&
        pl.y < this.powerup.y + TANK && pl.y + TANK > this.powerup.y
      ) {
        this.applyPowerup(this.powerup.kind, this.powerup.x, this.powerup.y);
        this.powerup = null;
      }
    }

    /* -------- гул мотора -------- */
    chip.hum(!!pl && pl.alive && (Math.abs(pl.vx) > 4 || Math.abs(pl.vy) > 4));

    /* -------- HUD-тики -------- */
    const secs = `${Math.ceil(this.freezeT)}|${Math.ceil(this.shovelT)}|${Math.ceil(pl?.shieldT ?? 0)}`;
    if (secs !== this.lastIntSec) { this.lastIntSec = secs; this.pushHud(); }

    /* -------- этап пройден? -------- */
    if (this.queue.length === 0 && this.tanks.filter((t) => !t.isPlayer && t.alive).length === 0) {
      this.state = "stageclear";
      this.clearT = 0;
      const bonus = this.stage * 500;
      this.score += bonus;
      chip.stageClear();
      this.popups.push({ x: FIELD / 2, y: FIELD / 2 - 30, text: `БОНУС +${bonus}`, life: 1.6, maxLife: 1.6, color: "#ffd23e", big: true });
      this.pushHud();
    }
  }

  /* ------------------------- игрок ------------------------- */

  private spawnPlayer() {
    const t: Tank = {
      id: this.nextId++, isPlayer: true, kind: "player",
      x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], dir: 0, vx: 0, vy: 0,
      speed: 96, hp: 1, alive: true, spawnT: 0.9, shieldT: 3.2,
      flashT: 0, cooldown: 0, aiT: 0, tread: 0, bonus: false,
    };
    this.player = t;
    this.tanks.push(t);
  }

  private currentDir(): Dir | null {
    const order: Array<[string[], Dir]> = [
      [["KeyW", "ArrowUp"], 0],
      [["KeyD", "ArrowRight"], 1],
      [["KeyS", "ArrowDown"], 2],
      [["KeyA", "ArrowLeft"], 3],
    ];
    for (const [codes, d] of order) if (codes.some((c) => this.keys.has(c))) return d;
    return this.touchDir;
  }

  private drivePlayer(t: Tank, dt: number) {
    const dir = this.currentDir();
    const ice = this.tileAt(t.x + 16, t.y + 16) === T_ICE;
    const ACC = ice ? 260 : 1700;
    const FR = ice ? 150 : 2100;
    let dvx = 0, dvy = 0;
    if (dir !== null) {
      if (dir !== t.dir) this.turnTo(t, dir);
      dvx = DX[dir] * t.speed;
      dvy = DY[dir] * t.speed;
    }
    t.vx += clamp(dvx - t.vx, -ACC * dt, ACC * dt);
    t.vy += clamp(dvy - t.vy, -ACC * dt, ACC * dt);
    if (dvx === 0) t.vx -= clamp(t.vx, -FR * dt, FR * dt);
    if (dvy === 0) t.vy -= clamp(t.vy, -FR * dt, FR * dt);
    this.moveTank(t, dt);

    const wantFire = this.keys.has("Space") || this.keys.has("KeyJ") || this.keys.has("KeyF") || this.touchFire;
    if (wantFire) this.tryFire(t);
  }

  private driveEnemy(t: Tank, dt: number) {
    if (this.freezeT > 0) { t.vx = 0; t.vy = 0; return; }
    t.aiT -= dt;
    const before = t.x + t.y * 1000;
    t.vx = DX[t.dir] * t.speed;
    t.vy = DY[t.dir] * t.speed;
    this.moveTank(t, dt);
    const after = t.x + t.y * 1000;
    const blocked = Math.abs(after - before) < 0.001;
    if (blocked || t.aiT <= 0) {
      this.pickEnemyDir(t, blocked);
      t.aiT = 0.7 + rnd() * 1.9;
    }
    const st = ENEMY_STATS[t.kind as EnemyKind];
    if (t.cooldown <= 0 && rnd() < st.fireRate * dt) this.tryFire(t);
  }

  private pickEnemyDir(t: Tank, blocked: boolean) {
    const pl = this.player;
    const roll = rnd();
    let want: Dir | null = null;
    if (!blocked && roll < 0.42) { want = t.dir; }
    else if (roll < 0.72 && pl && pl.alive) {
      want = this.dirToward(t.x, t.y, pl.x, pl.y);
    } else if (roll < 0.86) {
      want = this.dirToward(t.x, t.y, BASE_X, BASE_Y);
    }
    if (want === null || want === undefined) want = Math.floor(rnd() * 4) as Dir;
    /* если желаемое направление сразу ведёт в стену — пробуем другие */
    const tries: Dir[] = [want];
    for (let d = 0 as Dir; d < 4; d = (d + 1) as Dir) if (!tries.includes(d)) tries.push(d);
    for (const d of tries) {
      const nx = t.x + DX[d] * 6, ny = t.y + DY[d] * 6;
      if (!this.rectSolid(clamp(nx, 0, FIELD - TANK), clamp(ny, 0, FIELD - TANK), t)) {
        if (d !== t.dir) this.turnTo(t, d);
        return;
      }
    }
  }

  private dirToward(x: number, y: number, tx: number, ty: number): Dir {
    const dx = tx - x, dy = ty - y;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
    return dy > 0 ? 2 : 0;
  }

  private turnTo(t: Tank, dir: Dir) {
    const vertical = dir === 0 || dir === 2;
    if (vertical) {
      const ny = Math.round(t.y / TS) * TS;
      if (ny !== t.y && !this.rectSolid(t.x, clamp(ny, 0, FIELD - TANK), t)) t.y = clamp(ny, 0, FIELD - TANK);
    } else {
      const nx = Math.round(t.x / TS) * TS;
      if (nx !== t.x && !this.rectSolid(clamp(nx, 0, FIELD - TANK), t.y, t)) t.x = clamp(nx, 0, FIELD - TANK);
    }
    t.dir = dir;
  }

  private moveTank(t: Tank, dt: number) {
    if (Math.abs(t.vx) > 1) {
      let nx = clamp(t.x + t.vx * dt, 0, FIELD - TANK);
      if (!this.rectSolid(nx, t.y, t)) {
        t.x = nx;
        const gy = Math.round(t.y / TS) * TS;
        const ny = t.y + clamp(gy - t.y, -110 * dt, 110 * dt);
        if (!this.rectSolid(t.x, ny, t)) t.y = ny;
      } else t.vx = 0;
    }
    if (Math.abs(t.vy) > 1) {
      let ny = clamp(t.y + t.vy * dt, 0, FIELD - TANK);
      if (!this.rectSolid(t.x, ny, t)) {
        t.y = ny;
        const gx = Math.round(t.x / TS) * TS;
        const nx = t.x + clamp(gx - t.x, -110 * dt, 110 * dt);
        if (!this.rectSolid(nx, t.y, t)) t.x = nx;
      } else t.vy = 0;
    }
    t.tread += Math.hypot(t.vx, t.vy) * dt * 0.09;
  }

  /* ------------------------- стрельба ------------------------- */

  private tryFire(t: Tank) {
    const mine = this.bullets.filter((b) => !b.dead && b.fromPlayer === t.isPlayer && this.bulletOwner(b) === t.id);
    if (t.isPlayer) {
      const max = this.playerPower >= 2 ? 2 : 1;
      if (mine.length >= max || t.cooldown > 0) return;
      const speed = this.playerPower >= 1 ? 340 : 262;
      this.spawnBullet(t, speed, 1 + this.playerPower);
      t.cooldown = 0.16;
      chip.shoot();
    } else {
      if (mine.length >= 1 || t.cooldown > 0) return;
      const st = ENEMY_STATS[t.kind as EnemyKind];
      this.spawnBullet(t, st.bullet, 1);
      t.cooldown = 0.4;
      chip.enemyShoot();
    }
  }

  private bulletOwner(b: Bullet): number {
    return (b as unknown as { owner: number }).owner ?? -1;
  }

  private spawnBullet(t: Tank, speed: number, power: number) {
    const cx = t.x + 16 + DX[t.dir] * 16;
    const cy = t.y + 16 + DY[t.dir] * 16;
    const b: Bullet = { x: cx, y: cy, dir: t.dir, speed, power, fromPlayer: t.isPlayer, dead: false };
    (b as unknown as { owner: number }).owner = t.id;
    this.bullets.push(b);
    /* вспышка у среза ствола */
    this.particles.push({
      x: cx, y: cy, vx: DX[t.dir] * 30, vy: DY[t.dir] * 30,
      life: 0.07, maxLife: 0.07, size: 7, color: "#ffe9a8", grav: 0,
    });
  }

  private moveBullet(b: Bullet, dt: number) {
    if (b.dead) return;
    b.x += DX[b.dir] * b.speed * dt;
    b.y += DY[b.dir] * b.speed * dt;
    if (b.x < 4 || b.y < 4 || b.x > FIELD - 4 || b.y > FIELD - 4) {
      b.dead = true;
      this.sparks(clamp(b.x, 6, FIELD - 6), clamp(b.y, 6, FIELD - 6), 4, "#cdd5bd");
      chip.steelHit();
      return;
    }
    /* штаб */
    if (this.baseAlive && b.x > BASE_X + 2 && b.x < BASE_X + 30 && b.y > BASE_Y + 2 && b.y < BASE_Y + 30) {
      b.dead = true;
      this.destroyBase();
      return;
    }
    /* рельеф */
    const vertical = b.dir === 0 || b.dir === 2;
    const leadX = vertical ? b.x : b.x + DX[b.dir] * 4;
    const leadY = vertical ? b.y + DY[b.dir] * 4 : b.y;
    const cBase = Math.round((vertical ? leadX : leadY) / TS) * TS - TS;
    const cells: Array<[number, number]> = [];
    if (vertical) {
      const row = Math.floor(leadY / TS);
      for (const c of [cBase / TS, cBase / TS + 1])
        if (row >= 0 && row < G && c >= 0 && c < G) cells.push([c, row]);
    } else {
      const col = Math.floor(leadX / TS);
      for (const r of [cBase / TS, cBase / TS + 1])
        if (r >= 0 && r < G && col >= 0 && col < G) cells.push([col, r]);
    }
    let hitBrick = false, hitSteel = false;
    for (const [cx, cy] of cells) {
      const idx = cy * G + cx;
      const t = this.grid[idx];
      if (t === T_BRICK) {
        this.grid[idx] = T_EMPTY;
        hitBrick = true;
        this.sparks(cx * TS + 8, cy * TS + 8, 5, "#c05a30");
      } else if (t === T_STEEL) {
        if (b.power >= 4) {
          this.grid[idx] = T_EMPTY;
          hitBrick = true;
          this.sparks(cx * TS + 8, cy * TS + 8, 6, "#c9d1c4");
        } else hitSteel = true;
      }
    }
    if (hitBrick) { b.dead = true; chip.brickHit(); return; }
    if (hitSteel) {
      b.dead = true;
      chip.steelHit();
      this.sparks(b.x, b.y, 5, "#e6eae2");
      return;
    }

    /* танки */
    for (const t of this.tanks) {
      if (!t.alive || t.spawnT > 0 || t.isPlayer === b.fromPlayer) continue;
      if (b.x > t.x + 2 && b.x < t.x + 30 && b.y > t.y + 2 && b.y < t.y + 30) {
        b.dead = true;
        if (t.isPlayer) this.hitPlayer(t);
        else this.hitEnemy(t);
        return;
      }
    }
  }

  private collideBullets() {
    for (let i = 0; i < this.bullets.length; i++) {
      for (let j = i + 1; j < this.bullets.length; j++) {
        const a = this.bullets[i], c = this.bullets[j];
        if (a.dead || c.dead || a.fromPlayer === c.fromPlayer) continue;
        if (Math.abs(a.x - c.x) < 7 && Math.abs(a.y - c.y) < 7) {
          a.dead = c.dead = true;
          this.sparks((a.x + c.x) / 2, (a.y + c.y) / 2, 6, "#ffe9a8");
          chip.steelHit();
        }
      }
    }
  }

  private hitPlayer(t: Tank) {
    if (t.shieldT > 0) {
      chip.shieldHit();
      this.rings.push({ x: t.x + 16, y: t.y + 16, r: 12, vr: 60, life: 0.25, maxLife: 0.25, color: "#8fd8e8" });
      return;
    }
    t.alive = false;
    this.lives--;
    this.playerPower = 0;
    this.explode(t.x + 16, t.y + 16, true);
    chip.bigBoom();
    this.shake = 9;
    this.hitStop = 0.07;
    chip.hum(false);
    if (this.lives > 0) {
      this.respawnT = 1.2;
      this.popup(t.x + 16, t.y, "−1 ЖИЗНЬ", "#ff5b45");
    } else {
      this.triggerGameOver("lives");
    }
    this.pushHud();
  }

  private hitEnemy(t: Tank) {
    t.hp--;
    t.flashT = 0.12;
    if (t.hp <= 0) {
      t.alive = false;
      const st = ENEMY_STATS[t.kind as EnemyKind];
      this.kills[t.kind as EnemyKind]++;
      this.score += st.score;
      this.explode(t.x + 16, t.y + 16, false);
      chip.smallBoom();
      this.shake = Math.max(this.shake, 4);
      this.hitStop = 0.045;
      this.popup(t.x + 16, t.y + 4, `+${st.score}`, "#ffd23e");
      if (t.bonus) this.dropPowerup();
      this.saveHi();
      this.pushHud();
    } else {
      chip.steelHit();
      this.sparks(t.x + 16, t.y + 16, 4, "#e6eae2");
    }
  }

  private destroyBase() {
    this.baseAlive = false;
    this.explode(BASE_X + 16, BASE_Y + 12, true);
    chip.baseLost();
    this.shake = 14;
    this.flashT = 0.8;
    this.hitStop = 0.1;
    chip.hum(false);
    this.triggerGameOver("base");
  }

  private triggerGameOver(reason: "lives" | "base") {
    this.gameOverReason = reason;
    this.overT = reason === "base" ? 1.3 : 1.0;
    this.saveHi();
    this.pushHud();
  }

  private saveHi() {
    if (this.score > this.hi) {
      this.hi = this.score;
      this.newRecord = true;
      try { localStorage.setItem("sp_hi", String(this.hi)); } catch { /* ignore */ }
    }
  }

  /* ------------------------- враги ------------------------- */

  private setupStage() {
    this.loadStageMap();
    this.tanks = [];
    this.bullets = [];
    this.powerup = null;
    this.freezeT = 0;
    this.shovelT = 0;
    this.baseAlive = true;
    this.kills = { basic: 0, fast: 0, power: 0, armor: 0 };
    this.queue = buildWave(this.stage);
    this.spawnCount = 0;
    this.spawnT = 0.4;
    this.spawnPlayer();
    this.state = "playing";
    this.pushHud();
  }

  private spawnEnemy() {
    const kind = this.queue.shift();
    if (!kind) return;
    /* выбираем свободную точку выхода */
    let spot: [number, number] | null = null;
    for (let i = 0; i < 3; i++) {
      const s = SPAWNS[(this.spawnSlot + i) % 3];
      const busy = this.tanks.some(
        (t) => t.alive && Math.abs(t.x - s[0]) < 40 && Math.abs(t.y - s[1]) < 40,
      );
      if (!busy) { spot = s; this.spawnSlot = (this.spawnSlot + i + 1) % 3; break; }
    }
    if (!spot) { this.queue.unshift(kind); this.spawnT = 0.8; return; }
    const st = ENEMY_STATS[kind];
    const speedMul = 1 + Math.min(0.3, (this.stage - 1) * 0.035);
    const t: Tank = {
      id: this.nextId++, isPlayer: false, kind,
      x: spot[0], y: spot[1], dir: 2, vx: 0, vy: 0,
      speed: st.speed * speedMul, hp: st.hp, alive: true,
      spawnT: 1.0, shieldT: 0, flashT: 0, cooldown: 0.5, aiT: 0.2,
      tread: 0, bonus: BONUS_INDEXES.has(this.spawnCount),
    };
    this.spawnCount++;
    this.tanks.push(t);
    this.spawnT = Math.max(1.1, 2.3 - this.stage * 0.12);
    chip.spawnTick();
    this.pushHud();
  }

  /* ------------------------- бонусы ------------------------- */

  private dropPowerup() {
    const kinds: PowerKind[] = ["star", "star", "timer", "helmet", "grenade", "shovel", "tank"];
    const kind = kinds[Math.floor(rnd() * kinds.length)];
    const free: Array<[number, number]> = [];
    for (let cy = 1; cy < 12; cy++)
      for (let cx = 0; cx < 12; cx++) {
        const px = cx * TANK + (cx > 5 ? TANK : 0);
        const py = cy * TANK;
        if (px > FIELD - TANK || py > FIELD - TANK) continue;
        const tt = this.tileAt(px + 8, py + 8);
        if (tt === T_STEEL || tt === T_WATER) continue;
        const onTank = this.tanks.some((t) => t.alive && px < t.x + TANK && px + TANK > t.x && py < t.y + TANK && py + TANK > t.y);
        if (onTank) continue;
        free.push([px, py]);
      }
    if (free.length === 0) return;
    const [px, py] = free[Math.floor(rnd() * free.length)];
    this.powerup = { x: px, y: py, kind, t: 16 };
    chip.spawnTick();
  }

  private applyPowerup(kind: PowerKind, x: number, y: number) {
    const cx = x + 16, cy = y + 16;
    this.rings.push({ x: cx, y: cy, r: 6, vr: 90, life: 0.35, maxLife: 0.35, color: "#ffd23e" });
    switch (kind) {
      case "star":
        this.playerPower = Math.min(3, this.playerPower + 1);
        this.popup(cx, y, "ЗВЕЗДА!", "#ffd23e");
        chip.powerUp();
        break;
      case "tank":
        this.lives++;
        this.popup(cx, y, "+ЖИЗНЬ", "#8fd8e8");
        chip.extraLife();
        break;
      case "helmet":
        if (this.player) this.player.shieldT = 12;
        this.popup(cx, y, "БРОНЯ", "#8fd8e8");
        chip.powerUp();
        break;
      case "timer":
        this.freezeT = 10;
        this.popup(cx, y, "СТОП!", "#8fd8e8");
        chip.freeze();
        break;
      case "grenade": {
        this.popup(cx, y, "ЗАЛП!", "#ff5b45");
        this.flashT = 0.7;
        this.shake = 10;
        for (const t of this.tanks) {
          if (!t.isPlayer && t.alive && t.spawnT <= 0) {
            t.alive = false;
            const st = ENEMY_STATS[t.kind as EnemyKind];
            this.kills[t.kind as EnemyKind]++;
            this.score += st.score;
            this.explode(t.x + 16, t.y + 16, false);
          }
        }
        chip.bigBoom();
        break;
      }
      case "shovel":
        this.shovelT = 16;
        for (const [rx, ry] of RING) this.grid[ry * G + rx] = T_STEEL;
        this.popup(cx, y, "КРЕПОСТЬ", "#ffd23e");
        chip.powerUp();
        break;
    }
    this.score += 500;
    this.saveHi();
    this.pushHud();
  }

  /* ------------------------- эффекты ------------------------- */

  private sparks(x: number, y: number, n: number, color: string) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, s = 40 + rnd() * 90;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.18 + rnd() * 0.14, maxLife: 0.3, size: 2 + rnd() * 2, color, grav: 0,
      });
    }
  }

  private explode(x: number, y: number, big: boolean) {
    const n = big ? 26 : 15;
    const cols = ["#ff5b45", "#ff9d2e", "#ffd23e", "#f7f0e1"];
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, s = 30 + rnd() * (big ? 190 : 130);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20,
        life: 0.3 + rnd() * (big ? 0.5 : 0.35), maxLife: 0.7,
        size: 2 + rnd() * (big ? 5 : 3.5), color: cols[i % cols.length], grav: 120,
      });
    }
    this.rings.push({ x, y, r: 4, vr: big ? 160 : 110, life: 0.32, maxLife: 0.32, color: "#ff9d2e" });
    this.rings.push({ x, y, r: 2, vr: big ? 220 : 150, life: 0.24, maxLife: 0.24, color: "#f7f0e1" });
  }

  private popup(x: number, y: number, text: string, color: string) {
    this.popups.push({ x: clamp(x, 40, FIELD - 40), y: clamp(y, 20, FIELD - 10), text, life: 1, maxLife: 1, color, big: false });
  }

  /* ------------------------- HUD ------------------------- */

  pushHud() {
    const alive = this.tanks.filter((t) => !t.isPlayer && t.alive).length;
    this.cb({
      state: this.state,
      score: this.score,
      hi: this.hi,
      lives: this.lives,
      stage: this.stage,
      enemiesLeft: this.queue.length + alive,
      power: this.playerPower,
      muted: chip.muted,
      frozenT: Math.ceil(this.freezeT),
      shovelT: Math.ceil(this.shovelT),
      shieldT: Math.ceil(this.player?.shieldT ?? 0),
      killed: { ...this.kills },
      gameOverReason: this.gameOverReason,
      newRecord: this.newRecord,
    });
  }

  /* ============================ рендер ============================ */

  private render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (this.shake > 0.3) {
      ctx.translate((rnd() - 0.5) * this.shake, (rnd() - 0.5) * this.shake);
    }
    ctx.fillStyle = "#070804";
    ctx.fillRect(-8, -8, FIELD + 16, FIELD + 16);

    this.drawTerrain(ctx, false);
    this.drawBase(ctx);
    this.drawSpawnStars(ctx);
    for (const t of this.tanks) if (t.alive && t.spawnT <= 0) this.drawTank(ctx, t);
    this.drawBullets(ctx);
    this.drawTerrain(ctx, true);
    this.drawPowerup(ctx);

    /* частицы, кольца, всплывашки */
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    for (const r of this.rings) {
      ctx.globalAlpha = clamp(r.life / r.maxLife, 0, 1);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(1, r.r), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of this.popups) {
      const k = 1 - p.life / p.maxLife;
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.font = p.big ? "16px 'Russo One', sans-serif" : "bold 10px Rubik, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#070804";
      ctx.fillText(p.text, p.x + 1, p.y - k * 16 + 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y - k * 16);
    }
    ctx.globalAlpha = 1;

    if (this.flashT > 0) {
      ctx.globalAlpha = clamp(this.flashT, 0, 1) * 0.55;
      ctx.fillStyle = "#f7f0e1";
      ctx.fillRect(0, 0, FIELD, FIELD);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  private drawTerrain(ctx: CanvasRenderingContext2D, overlay: boolean) {
    const frame = Math.floor(this.time * 2) % 2;
    for (let cy = 0; cy < G; cy++)
      for (let cx = 0; cx < G; cx++) {
        const t = this.grid[cy * G + cx];
        const x = cx * TS, y = cy * TS;
        if (overlay) {
          if (t === T_FOREST) this.drawForestCell(ctx, x, y, cx, cy);
          continue;
        }
        if (t === T_BRICK) this.drawBrick(ctx, x, y);
        else if (t === T_STEEL) this.drawSteel(ctx, x, y);
        else if (t === T_WATER) this.drawWater(ctx, x, y, frame);
        else if (t === T_ICE) this.drawIce(ctx, x, y, cx, cy);
      }
  }

  private drawBrick(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.fillStyle = "#b8452a";
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = "#d96a3f";
    ctx.fillRect(x, y, TS, 2);
    ctx.fillStyle = "#7c2e1c";
    ctx.fillRect(x, y + 7, TS, 2);
    ctx.fillRect(x + 7, y, 2, 7);
    ctx.fillRect(x + 3, y + 9, 2, 7);
    ctx.fillRect(x + 11, y + 9, 2, 7);
  }

  private drawSteel(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.fillStyle = "#9aa59b";
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = "#e6eae2";
    ctx.fillRect(x, y, TS, 2);
    ctx.fillRect(x, y, 2, TS);
    ctx.fillStyle = "#5c665c";
    ctx.fillRect(x, y + TS - 2, TS, 2);
    ctx.fillRect(x + TS - 2, y, 2, TS);
    ctx.fillStyle = "#78837a";
    ctx.fillRect(x + 5, y + 5, 6, 6);
  }

  private drawWater(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number) {
    ctx.fillStyle = "#14586e";
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = frame ? "#2c86a3" : "#1f6f8a";
    const off = frame ? 4 : 0;
    ctx.fillRect(x, y + ((2 + off) % 16), TS, 2);
    ctx.fillRect(x, y + ((9 + off) % 16), TS, 2);
    ctx.fillStyle = "#3ba3bd";
    ctx.fillRect(x + ((frame ? 3 : 9) % 16), y + 4 + (frame ? 0 : 6), 5, 1);
  }

  private drawIce(ctx: CanvasRenderingContext2D, x: number, y: number, cx: number, cy: number) {
    ctx.fillStyle = "#b9d6cf";
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = "#e2f2ec";
    if ((cx + cy) % 2 === 0) ctx.fillRect(x + 2, y + 3, 8, 2);
    else ctx.fillRect(x + 5, y + 9, 8, 2);
  }

  private drawForestCell(ctx: CanvasRenderingContext2D, x: number, y: number, cx: number, cy: number) {
    ctx.globalAlpha = 0.94;
    ctx.fillStyle = "#1c4a22";
    ctx.fillRect(x, y, TS, TS);
    ctx.fillStyle = "#2e7d32";
    const s = (cx * 7 + cy * 13) % 4;
    ctx.fillRect(x + s, y + ((s * 3) % 10), 7, 6);
    ctx.fillRect(x + ((s * 5 + 4) % 9), y + ((s * 2 + 7) % 9), 6, 6);
    ctx.fillStyle = "#4c9a3f";
    ctx.fillRect(x + ((s * 4 + 2) % 10), y + ((s + 3) % 10), 3, 3);
    ctx.globalAlpha = 1;
  }

  private drawBase(ctx: CanvasRenderingContext2D) {
    /* площадка */
    ctx.fillStyle = "#141a0d";
    ctx.fillRect(BASE_X - 2, BASE_Y - 2, TANK + 4, TANK + 4);
    ctx.fillStyle = "#2a3320";
    ctx.fillRect(BASE_X - 2, BASE_Y - 2, TANK + 4, 2);
    drawChihuahua(ctx, BASE_X, BASE_Y, { alive: this.baseAlive, t: this.time });
    /* мигание укреплений, когда лопата заканчивается */
    if (this.shovelT > 0 && this.shovelT < 3 && Math.floor(this.time * 6) % 2 === 0) {
      ctx.globalAlpha = 0.5;
      for (const [rx, ry] of RING) this.drawBrick(ctx, rx * TS, ry * TS);
      ctx.globalAlpha = 1;
    }
  }

  private drawSpawnStars(ctx: CanvasRenderingContext2D) {
    for (const t of this.tanks) {
      if (!t.alive || t.spawnT <= 0) continue;
      const cx = t.x + 16, cy = t.y + 16;
      const ph = Math.floor(this.time * 14) % 3;
      const s = 6 + ph * 4;
      ctx.strokeStyle = ph === 1 ? "#ffb347" : "#f7f0e1";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy);
      ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
      const d = s * 0.55;
      ctx.moveTo(cx - d, cy - d); ctx.lineTo(cx + d, cy + d);
      ctx.moveTo(cx - d, cy + d); ctx.lineTo(cx + d, cy - d);
      ctx.stroke();
    }
  }

  private tankPalette(t: Tank): { tread: string; treadL: string; hull: string; hullD: string; turret: string; barrel: string } {
    if (t.isPlayer)
      return { tread: "#4a4018", treadL: "#6b5a1c", hull: "#e8c84a", hullD: "#b89a2e", turret: "#f4dd85", barrel: "#d8c05a" };
    switch (t.kind) {
      case "fast":
        return { tread: "#575c52", treadL: "#767c70", hull: "#e2e6dc", hullD: "#aab0a4", turret: "#f2f4ee", barrel: "#c6ccc0" };
      case "power":
        return { tread: "#4e2d22", treadL: "#6b4030", hull: "#cf6a4a", hullD: "#9c4a32", turret: "#e89272", barrel: "#b85c40" };
      case "armor": {
        const tiers: Record<number, [string, string, string]> = {
          1: ["#d8dcd2", "#aab0a4", "#eef0e9"],
          2: ["#c2a23f", "#93792c", "#dcbd62"],
          3: ["#9aa33f", "#727a2c", "#b5bf57"],
          4: ["#6f8f4f", "#55703a", "#8fad6d"],
        };
        const [hull, hullD, turret] = tiers[clamp(t.hp, 1, 4)];
        return { tread: "#33421f", treadL: "#4a5c30", hull, hullD, turret, barrel: hullD };
      }
      default:
        return { tread: "#4c514a", treadL: "#6a7066", hull: "#b9beb2", hullD: "#8d938a", turret: "#d2d7cc", barrel: "#a9afa3" };
    }
  }

  private drawTank(ctx: CanvasRenderingContext2D, t: Tank) {
    const p = this.tankPalette(t);
    const { x, y } = t;
    const vert = t.dir === 0 || t.dir === 2;
    const ph = Math.floor(t.tread * 6) % 2;

    /* гусеницы */
    ctx.fillStyle = p.tread;
    if (vert) {
      ctx.fillRect(x + 1, y + 2, 7, 28);
      ctx.fillRect(x + 24, y + 2, 7, 28);
    } else {
      ctx.fillRect(x + 2, y + 1, 28, 7);
      ctx.fillRect(x + 2, y + 24, 28, 7);
    }
    ctx.fillStyle = p.treadL;
    for (let i = 0; i < 4; i++) {
      const o = (i * 8 + ph * 4) % 28;
      if (vert) {
        ctx.fillRect(x + 2, y + 2 + o, 5, 3);
        ctx.fillRect(x + 25, y + 2 + o, 5, 3);
      } else {
        ctx.fillRect(x + 2 + o, y + 2, 3, 5);
        ctx.fillRect(x + 2 + o, y + 25, 3, 5);
      }
    }
    /* корпус */
    ctx.fillStyle = p.hull;
    ctx.fillRect(x + 8, y + 7, 16, 18);
    ctx.fillStyle = p.hullD;
    ctx.fillRect(x + 8, y + 7, 16, 3);
    ctx.fillRect(x + 8, y + 21, 16, 4);
    /* ствол */
    ctx.fillStyle = p.barrel;
    if (t.dir === 0) ctx.fillRect(x + 14, y, 4, 12);
    else if (t.dir === 2) ctx.fillRect(x + 14, y + 20, 4, 12);
    else if (t.dir === 1) ctx.fillRect(x + 20, y + 14, 12, 4);
    else ctx.fillRect(x, y + 14, 12, 4);
    /* башня */
    ctx.fillStyle = p.turret;
    ctx.fillRect(x + 11, y + 11, 10, 10);
    ctx.fillStyle = p.hullD;
    ctx.fillRect(x + 13, y + 13, 6, 6);

    /* бонусный мигает красным */
    if (t.bonus && Math.floor(this.time * 6) % 2 === 0) {
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = "#ff5b45";
      ctx.fillRect(x + 1, y + 1, 30, 30);
      ctx.globalAlpha = 1;
    }
    /* заморозка */
    if (!t.isPlayer && this.freezeT > 0) {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = "#8fd8e8";
      ctx.fillRect(x, y, 32, 32);
      ctx.globalAlpha = 1;
    }
    /* вспышка урона */
    if (t.flashT > 0) {
      ctx.globalAlpha = clamp(t.flashT * 7, 0, 0.85);
      ctx.fillStyle = "#f7f0e1";
      ctx.fillRect(x, y, 32, 32);
      ctx.globalAlpha = 1;
    }
    /* щит */
    if (t.shieldT > 0) {
      const blink = t.shieldT < 1 && Math.floor(this.time * 10) % 2 === 0;
      ctx.globalAlpha = blink ? 0.25 : 0.8;
      ctx.strokeStyle = "#f7f0e1";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -this.time * 30;
      ctx.beginPath();
      ctx.arc(x + 16, y + 16, 19, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "#8fd8e8";
      ctx.lineDashOffset = this.time * 22;
      ctx.beginPath();
      ctx.arc(x + 16, y + 16, 15, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    }
  }

  private drawBullets(ctx: CanvasRenderingContext2D) {
    for (const b of this.bullets) {
      if (b.dead) continue;
      ctx.fillStyle = "#f7f0e1";
      ctx.fillRect(b.x - 3, b.y - 3, 6, 6);
      ctx.fillStyle = b.fromPlayer ? "#ffd23e" : "#ff9d8a";
      ctx.fillRect(b.x - 1, b.y - 1, 2, 2);
    }
  }

  private drawPowerup(ctx: CanvasRenderingContext2D) {
    const pu = this.powerup;
    if (!pu) return;
    if (pu.t < 3 && Math.floor(this.time * 8) % 2 === 0) return;
    const { x, y } = pu;
    ctx.fillStyle = "#10140a";
    ctx.fillRect(x, y, 32, 32);
    ctx.strokeStyle = Math.floor(this.time * 5) % 2 ? "#ff5b45" : "#a5281c";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, 30, 30);
    const cx = x + 16, cy = y + 16;
    switch (pu.kind) {
      case "star": {
        ctx.fillStyle = "#ffd23e";
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
          const a2 = a + Math.PI / 5;
          ctx.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
          ctx.lineTo(cx + Math.cos(a2) * 4, cy + Math.sin(a2) * 4);
        }
        ctx.closePath();
        ctx.fill();
        break;
      }
      case "tank": {
        ctx.fillStyle = "#8fa34f";
        ctx.fillRect(x + 7, y + 9, 4, 14);
        ctx.fillRect(x + 21, y + 9, 4, 14);
        ctx.fillRect(x + 11, y + 12, 10, 9);
        ctx.fillRect(x + 15, y + 6, 2, 7);
        break;
      }
      case "helmet": {
        ctx.fillStyle = "#d2d7cc";
        ctx.beginPath();
        ctx.arc(cx, cy + 2, 9, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(cx - 11, cy + 2, 22, 3);
        break;
      }
      case "timer": {
        ctx.strokeStyle = "#8fd8e8";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx, cy - 5);
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + 4, cy + 2);
        ctx.stroke();
        break;
      }
      case "grenade": {
        ctx.fillStyle = "#5c7a45";
        ctx.fillRect(x + 11, y + 12, 10, 12);
        ctx.fillRect(x + 13, y + 9, 6, 3);
        ctx.fillStyle = "#c9d1c4";
        ctx.fillRect(x + 19, y + 7, 5, 2);
        break;
      }
      case "shovel": {
        ctx.fillStyle = "#8a5a2c";
        ctx.fillRect(cx - 1, y + 6, 3, 12);
        ctx.fillStyle = "#c9d1c4";
        ctx.fillRect(cx - 4, y + 18, 9, 8);
        break;
      }
    }
  }
}
