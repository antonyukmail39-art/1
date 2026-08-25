import { useCallback, useEffect, useRef, useState } from "react";
import { Engine, type HudSnapshot } from "./game/engine";
import { drawChihuahua } from "./game/sprites";
import { ENEMY_STATS, DIFF, type EnemyKind, type Difficulty } from "./game/levels";
import { chip } from "./game/audio";

/* ================= вспомогательные компоненты ================= */

function ChiPixel({ size = 96, alive = true }: { size?: number; alive?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const u = size / 16;
    cv.width = size;
    cv.height = size + u * 4;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      ctx.clearRect(0, 0, cv.width, cv.height);
      drawChihuahua(ctx, 0, u * 3, { alive, t: (now - t0) / 1000 + 1, u });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [size, alive]);
  return <canvas ref={ref} className="pixel-canvas" style={{ width: size, height: size + size / 4 }} />;
}

const TankIcon = ({ color = "#ff5b45", size = 14 }: { color?: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
    <rect x="1" y="3" width="3" height="9" fill={color} />
    <rect x="10" y="3" width="3" height="9" fill={color} />
    <rect x="4.5" y="5" width="5" height="6" fill={color} />
    <rect x="6" y="0" width="2" height="5" fill={color} />
  </svg>
);

const FlagIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden>
    <rect x="2" y="1" width="2" height="14" fill="#cdd5bd" />
    <path d="M4 2h9l-3 3 3 3H4z" fill="#ff5b45" />
  </svg>
);

const HeartIcon = ({ size = 14, dim = false }: { size?: number; dim?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
    <path
      d="M2 3h3v2h1V3h3v2h1V3h2v4h-2v2h-2v2h-1v2h-1v-2H5v-2H3V7H1V3h1z"
      fill={dim ? "#3a4630" : "#ff5b45"}
      transform="translate(0.5 0)"
    />
  </svg>
);

function PowerPips({ power }: { power: number }) {
  return (
    <div className="flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2.5 w-2.5 rotate-45 border"
          style={{
            background: i < power ? "#ffd23e" : "transparent",
            borderColor: i < power ? "#ffd23e" : "#3a4630",
            boxShadow: i < power ? "0 0 6px rgba(255,210,62,.7)" : "none",
          }}
        />
      ))}
    </div>
  );
}

function Key({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <span className={`keycap ${wide ? "px-3" : ""}`}>{children}</span>;
}

/* ================= экраны-оверлеи ================= */

function ControlsGuide({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`grid gap-y-2 gap-x-6 text-[13px] text-armor-300 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
      <div className="flex items-center gap-2">
        <Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key>
        <span className="text-armor-400">/</span>
        <Key>↑</Key><Key>←</Key><Key>↓</Key><Key>→</Key>
        <span className="ml-1">движение</span>
      </div>
      <div className="flex items-center gap-2">
        <Key wide>SPACE</Key><span className="text-armor-400">/</span><Key>J</Key>
        <span className="ml-1">огонь</span>
      </div>
      <div className="flex items-center gap-2">
        <Key>P</Key><span className="ml-1">пауза</span>
        <Key>M</Key><span className="ml-1">звук</span>
      </div>
      <div className="flex items-center gap-2">
        <Key wide>ENTER</Key><span className="ml-1">старт / дальше</span>
      </div>
    </div>
  );
}

function MenuScreen({ hud, onStart, onDiff }: { hud: HudSnapshot; onStart: () => void; onDiff: (d: Difficulty) => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[rgba(5,6,3,0.88)] fade-in px-4">
      <div className="pop-in flex flex-col items-center">
        <div className="hazard-strip h-2 w-56 mb-5 opacity-80" />
        <div className="flex items-end gap-4">
          <ChiPixel size={88} />
          <div>
            <div className="font-display text-[11px] tracking-[0.4em] text-flare-400 mb-1">ТАНКОВЫЙ РУБЕЖ</div>
            <h1 className="font-display title-track text-4xl sm:text-5xl leading-none text-hull-400">
              СТАЛЬНОЙ<br />ПЁС
            </h1>
          </div>
        </div>
        <p className="mt-4 max-w-[340px] text-center text-[13px] leading-relaxed text-armor-300">
          Волна из <b className="text-flare-300">20 машин</b> прёт на штаб. В штабе — чихуахуа.
          Чихуахуа <b className="text-alert-400">нельзя</b> травмировать. Остальное — можно.
        </p>
      </div>
      <button
        onClick={onStart}
        className="touch-btn mt-6 border-2 border-flare-500 bg-flare-500/10 px-8 py-3 font-display text-lg text-flare-400 transition-all hover:bg-flare-500 hover:text-armor-950 hover:shadow-[0_0_28px_rgba(255,157,46,0.5)]"
      >
        В БОЙ <span className="blink-soft">▸</span>
      </button>
      <div className="blink-hard mt-2 text-[11px] tracking-[0.25em] text-armor-400 font-display">НАЖМИ ENTER</div>

      {/* сложность */}
      <div className="mt-5 flex flex-col items-center gap-2">
        <span className="font-display text-[10px] tracking-[0.35em] text-armor-500">СЛОЖНОСТЬ</span>
        <div className="flex gap-2">
          {(Object.keys(DIFF) as Difficulty[]).map((d) => {
            const active = hud.difficulty === d;
            return (
              <button
                key={d}
                onClick={() => onDiff(d)}
                title={DIFF[d].hint}
                className={`touch-btn border px-3 py-1.5 font-display text-[11px] tracking-widest transition-all ${
                  active
                    ? "border-flare-500 bg-flare-500/15 text-flare-400 shadow-[0_0_14px_rgba(255,157,46,0.35)]"
                    : "border-armor-600 text-armor-400 hover:border-armor-400 hover:text-armor-200"
                }`}
              >
                {DIFF[d].label}
              </button>
            );
          })}
        </div>
        <span className="text-[11px] text-armor-500">{DIFF[hud.difficulty].hint}</span>
      </div>

      <div className="mt-4"><ControlsGuide /></div>
      <div className="mt-4 flex items-center gap-5 text-[12px] tracking-widest text-armor-400">
        <span>РЕКОРД: <span className="text-flare-300 font-display">{hud.hi}</span></span>
        {hud.bestStage > 0 && (
          <span>ДОШЁЛ ДО ЭТАПА <span className="text-flare-300 font-display">{hud.bestStage}</span></span>
        )}
      </div>
    </div>
  );
}

function IntermissionScreen({ stage }: { stage: number }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b0d07] curtain-in">
      <div className="text-center">
        <FlagIcon size={34} />
        <div className="font-display mt-3 text-3xl tracking-[0.3em] text-armor-300">ЭТАП {stage}</div>
        <div className="mt-2 text-[12px] text-armor-500 tracking-widest">приготовиться…</div>
      </div>
    </div>
  );
}

function PauseScreen({ onResume, onMenu }: { onResume: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[rgba(5,6,3,0.82)] fade-in">
      <div className="font-display text-4xl tracking-[0.35em] text-flare-400 blink-soft">ПАУЗА</div>
      <div className="mt-6 flex gap-3">
        <button onClick={onResume} className="touch-btn border border-flare-500 px-5 py-2 font-display text-sm text-flare-400 hover:bg-flare-500 hover:text-armor-950 transition-colors">
          ПРОДОЛЖИТЬ
        </button>
        <button onClick={onMenu} className="touch-btn border border-armor-600 px-5 py-2 font-display text-sm text-armor-300 hover:border-armor-400 transition-colors">
          В МЕНЮ
        </button>
      </div>
      <div className="mt-5"><ControlsGuide compact /></div>
    </div>
  );
}

const KIND_LABEL: Record<EnemyKind, string> = {
  basic: "РАЗВЕДЧИК",
  fast: "НАЛЁТЧИК",
  power: "ШТУРМОВИК",
  armor: "КРЕЙСЕР",
};

function StageClearScreen({ hud, onNext }: { hud: HudSnapshot; onNext: () => void }) {
  const kinds: EnemyKind[] = ["basic", "fast", "power", "armor"];
  const total = kinds.reduce((s, k) => s + hud.killed[k] * ENEMY_STATS[k].score, 0);
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[rgba(5,6,3,0.9)] fade-in px-6">
      <div className="pop-in w-full max-w-[300px] border border-armor-600 bg-armor-900/90 p-5">
        <div className="font-display text-center text-xl tracking-[0.2em] text-flare-400">ЭТАП {hud.stage} ПРОЙДЕН</div>
        <div className="mt-1 text-center text-[11px] tracking-widest text-armor-400">ЧИХУАХУА В ПОРЯДКЕ. ПОКА ЧТО.</div>
        <div className="mt-4 space-y-1.5 text-[13px]">
          {kinds.map((k) => (
            <div key={k} className="flex items-center justify-between border-b border-armor-800 pb-1">
              <span className="text-armor-300">{KIND_LABEL[k]}</span>
              <span className="text-armor-200">
                {hud.killed[k]} × {ENEMY_STATS[k].score}
                <span className="ml-2 inline-block w-10 text-right text-flare-300">{hud.killed[k] * ENEMY_STATS[k].score}</span>
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-2 font-display text-sm">
            <span className="text-armor-200">ИТОГО</span>
            <span className="text-flare-400">{total}</span>
          </div>
          <div className="flex justify-between text-[12px] text-armor-400">
            <span>БОНУС ЭТАПА</span><span className="text-flare-300">+{hud.stage * 500}</span>
          </div>
          <div className="flex justify-between text-[12px] text-armor-400">
            <span>ВРЕМЯ БОЯ</span><span className="text-armor-200 font-display">{hud.stageTime}с</span>
          </div>
          <div className="flex justify-between text-[12px] text-armor-400">
            <span>ТОЧНОСТЬ ОГНЯ</span><span className="text-armor-200 font-display">{hud.accuracy}%</span>
          </div>
        </div>
        <button onClick={onNext} className="touch-btn mt-5 w-full border-2 border-flare-500 py-2 font-display text-flare-400 hover:bg-flare-500 hover:text-armor-950 transition-colors">
          ЭТАП {hud.stage + 1} ▸
        </button>
        <div className="blink-hard mt-2 text-center text-[10px] tracking-[0.25em] text-armor-500 font-display">ENTER</div>
      </div>
    </div>
  );
}

function GameOverScreen({ hud, onRestart, onMenu }: { hud: HudSnapshot; onRestart: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-20 flex items-end justify-center bg-[rgba(20,4,2,0.55)] overflow-hidden">
      <div className="rise-up mb-0 w-full bg-[#160806]/95 border-t-4 border-alert-500 px-6 py-8 text-center">
        <div className="font-display text-4xl sm:text-5xl tracking-[0.18em] text-alert-400" style={{ textShadow: "0 0 24px rgba(214,58,42,.6)" }}>
          ИГРА ОКОНЧЕНА
        </div>
        <div className="mt-2 text-[13px] text-armor-300">
          {hud.gameOverReason === "base"
            ? "Штаб разбит. Чихуахуа эвакуирован в слезах."
            : "Экипаж исчерпан. Чихуахуа скорбит."}
        </div>
        <div className="mt-5 flex items-center justify-center gap-8 font-display">
          <div>
            <div className="text-[10px] tracking-[0.3em] text-armor-400">СЧЁТ</div>
            <div className="text-2xl text-hull-400">{hud.score}</div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.3em] text-armor-400">ЭТАП</div>
            <div className="text-2xl text-armor-200">{hud.stage}</div>
          </div>
          <div>
            <div className="text-[10px] tracking-[0.3em] text-armor-400">РЕКОРД</div>
            <div className={`text-2xl ${hud.newRecord ? "text-flare-400" : "text-armor-200"}`}>{hud.hi}</div>
          </div>
        </div>
        {hud.newRecord && <div className="blink-soft mt-2 font-display text-sm text-flare-400">★ НОВЫЙ РЕКОРД ★</div>}
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={onRestart} className="touch-btn border-2 border-alert-500 px-6 py-2 font-display text-alert-400 hover:bg-alert-500 hover:text-white transition-colors">
            РЕВАНШ
          </button>
          <button onClick={onMenu} className="touch-btn border border-armor-600 px-6 py-2 font-display text-sm text-armor-300 hover:border-armor-400 transition-colors">
            В МЕНЮ
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= сенсорное управление ================= */

function TouchControls({ engine }: { engine: Engine | null }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    setVisible(mq.matches);
    const on = () => setVisible(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  if (!visible || !engine) return null;

  const bind = (dir: 0 | 1 | 2 | 3) => ({
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); engine.setTouchDir(dir); },
    onPointerUp: () => engine.setTouchDir(null),
    onPointerLeave: () => engine.setTouchDir(null),
    onPointerCancel: () => engine.setTouchDir(null),
  });
  const fire = {
    onPointerDown: (e: React.PointerEvent) => { e.preventDefault(); engine.setTouchFire(true); },
    onPointerUp: () => engine.setTouchFire(false),
    onPointerLeave: () => engine.setTouchFire(false),
    onPointerCancel: () => engine.setTouchFire(false),
  };
  const btn = "touch-btn flex items-center justify-center h-14 w-14 border border-armor-600 bg-armor-800/80 text-armor-200 font-display text-xl select-none";
  return (
    <div className="mt-3 flex items-center justify-between gap-4 sm:hidden">
      <div className="grid grid-cols-3 gap-1.5">
        <div />
        <button className={btn} {...bind(0)}>▲</button>
        <div />
        <button className={btn} {...bind(3)}>◀</button>
        <div />
        <button className={btn} {...bind(1)}>▶</button>
        <div />
        <button className={btn} {...bind(2)}>▼</button>
        <div />
      </div>
      <button
        className="touch-btn h-20 w-20 rounded-full border-2 border-alert-500 bg-alert-600/40 font-display text-sm text-alert-400"
        {...fire}
      >
        ОГОНЬ
      </button>
    </div>
  );
}

/* ================= главный компонент ================= */

const initialHud: HudSnapshot = {
  state: "menu", score: 0, hi: 0, lives: 3, stage: 1, enemiesLeft: 20,
  power: 0, muted: false, frozenT: 0, shovelT: 0, shieldT: 0,
  killed: { basic: 0, fast: 0, power: 0, armor: 0 },
  gameOverReason: null, newRecord: false,
  difficulty: "normal", musicOn: true, danger: 0, stageTime: 0,
  accuracy: 0, bestStage: 0, combo: 0, night: false,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(initialHud);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const eng = new Engine(cv, setHud);
    engineRef.current = eng;
    return () => { eng.destroy(); engineRef.current = null; };
  }, []);

  const start = useCallback(() => { chip.unlock(); engineRef.current?.startGame(); }, []);
  const resume = useCallback(() => engineRef.current?.togglePause(), []);
  const next = useCallback(() => engineRef.current?.nextStage(), []);
  const toMenu = useCallback(() => {
    const e = engineRef.current;
    if (!e) return;
    /* мягкий возврат: перезапуск движка в меню через pause+state невозможен — перезапустим */
    e.destroy();
    const cv = canvasRef.current;
    if (!cv) return;
    const eng = new Engine(cv, setHud);
    engineRef.current = eng;
  }, []);
  const toggleMute = useCallback(() => {
    chip.unlock();
    chip.setMuted(!chip.muted);
    engineRef.current?.pushHud();
  }, []);
  const toggleMusic = useCallback(() => engineRef.current?.toggleMusic(), []);
  const setDiff = useCallback((d: Difficulty) => engineRef.current?.setDifficulty(d), []);

  const enemyIcons = Math.max(0, Math.min(20, hud.enemiesLeft));
  const inBattle = hud.state === "playing" || hud.state === "paused";

  return (
    <div className="war-room-bg min-h-full stencil-dots">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-3 py-4 sm:px-6">
        {/* ======= шапка ======= */}
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="bezel flex h-11 w-11 items-center justify-center">
              <TankIcon color="#e8c84a" size={22} />
            </div>
            <div>
              <div className="font-display text-xl leading-none text-armor-200">
                СТАЛЬНОЙ <span className="text-flare-400">ПЁС</span>
              </div>
              <div className="mt-1 text-[10px] tracking-[0.35em] text-armor-500">ОБОРОНА ШТАБА • 8-БИТ</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="mr-2 hidden items-center gap-2 sm:flex">
              <span className={`h-2 w-2 rounded-full ${inBattle ? "bg-alert-400 led-on" : "bg-flare-400 led-amber"}`} />
              <span className="font-display text-[11px] tracking-widest text-armor-300">
                {hud.state === "playing" ? "ИДЁТ БОЙ" : hud.state === "paused" ? "ПАУЗА" : "ОЖИДАНИЕ"}
              </span>
            </div>
            <button
              onClick={toggleMute}
              className="touch-btn bezel px-3 py-2 font-display text-[11px] tracking-widest text-armor-200 hover:text-flare-400 transition-colors"
              title="Звук (M)"
            >
              {hud.muted ? "ЗВУК: ВЫКЛ" : "ЗВУК: ВКЛ"}
            </button>
            <button
              onClick={toggleMusic}
              className="touch-btn bezel px-3 py-2 font-display text-[11px] tracking-widest text-armor-200 hover:text-flare-400 transition-colors"
              title="Фоновая музыка"
            >
              {hud.musicOn ? "МУЗЫКА: ВКЛ" : "МУЗЫКА: ВЫКЛ"}
            </button>
            {hud.state === "playing" && (
              <button
                onClick={resume}
                className="touch-btn bezel px-3 py-2 font-display text-[11px] tracking-widest text-armor-200 hover:text-flare-400 transition-colors"
              >
                ПАУЗА (P)
              </button>
            )}
          </div>
        </header>

        {/* ======= игровая зона ======= */}
        <main className="flex flex-1 flex-col items-center gap-4 lg:flex-row lg:items-start lg:justify-center">
          <div className="bezel relative p-2.5 sm:p-3">
            <div
              className={`relative overflow-hidden border bg-black shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] transition-colors duration-200 ${
                hud.danger > 0.25 && inBattle ? "border-alert-500 danger-glow" : "border-armor-700"
              }`}
            >
              <canvas
                ref={canvasRef}
                className="pixel-canvas block h-auto w-[min(88vw,56vh)] sm:w-[min(70vw,62vh)]"
                style={{ aspectRatio: "1 / 1" }}
              />
              {/* CRT-слой */}
              <div className="crt-scanlines pointer-events-none absolute inset-0" />
              <div className="crt-vignette pointer-events-none absolute inset-0" />
              <div className="crt-flicker crt-vignette pointer-events-none absolute inset-0" />

              {hud.state === "menu" && <MenuScreen hud={hud} onStart={start} onDiff={setDiff} />}
              {hud.state === "intermission" && <IntermissionScreen stage={hud.stage} />}
              {hud.state === "paused" && (
                <PauseScreen onResume={resume} onMenu={toMenu} />
              )}
              {hud.state === "stageclear" && <StageClearScreen hud={hud} onNext={next} />}
              {hud.state === "gameover" && <GameOverScreen hud={hud} onRestart={start} onMenu={toMenu} />}
            </div>
            {/* шильдик под экраном */}
            <div className="mt-2 flex items-center justify-between px-1">
              <span className="font-display text-[10px] tracking-[0.3em] text-armor-500">МОДЕЛЬ ДП-1986</span>
              <span className={`h-1.5 w-6 rounded-full ${hud.state === "playing" ? "bg-alert-400 led-on" : "bg-armor-700"}`} />
            </div>
          </div>

          {/* ======= боковая панель HUD ======= */}
          <aside className="hud-panel w-[min(88vw,560px)] shrink-0 p-4 lg:w-[220px]">
            {/* остаток волны */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="font-display text-[11px] tracking-[0.25em] text-armor-400">ПРОТИВНИК</span>
                <span className="font-display text-sm text-alert-400">{enemyIcons}</span>
              </div>
              <div className="grid grid-cols-10 gap-x-1 gap-y-1.5 lg:grid-cols-2 lg:gap-x-2">
                {Array.from({ length: 20 }).map((_, i) => (
                  <span key={i} className={`flex justify-center transition-opacity duration-300 ${i < enemyIcons ? "opacity-100" : "opacity-15"}`}>
                    <TankIcon size={11} color={i < enemyIcons ? "#ff5b45" : "#55614a"} />
                  </span>
                ))}
              </div>
            </div>

            <div className="my-3 h-px bg-armor-700" />

            {/* игрок */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-[11px] tracking-[0.25em] text-armor-400">ЭКИПАЖ</div>
                <div className="mt-1.5 flex items-center gap-1.5">
                  {Array.from({ length: Math.max(0, Math.min(6, hud.lives)) }).map((_, i) => (
                    <TankIcon key={i} color="#e8c84a" size={13} />
                  ))}
                  {hud.lives === 0 && <span className="text-[12px] text-alert-400 font-display">0</span>}
                  {hud.lives > 6 && <span className="font-display text-sm text-hull-400">×{hud.lives}</span>}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] tracking-widest text-armor-500">ЗВЕЗДА</span>
                  <PowerPips power={hud.power} />
                </div>
              </div>
              <div className="text-right">
                <div className="font-display text-[11px] tracking-[0.25em] text-armor-400">ЭТАП</div>
                <div className="mt-1 flex items-center justify-end gap-1.5">
                  <FlagIcon size={15} />
                  <span className="font-display text-xl text-armor-200">{hud.stage}</span>
                </div>
              </div>
            </div>

            <div className="my-3 h-px bg-armor-700" />

            {/* счёт */}
            <div className="flex items-end justify-between">
              <div>
                <div className="font-display text-[11px] tracking-[0.25em] text-armor-400">СЧЁТ</div>
                <div className="font-display text-2xl text-hull-400 leading-tight">{hud.score}</div>
                {hud.combo >= 2 && (
                  <div className="font-display text-[12px] tracking-widest text-[#8fd8e8] pop-in">
                    СЕРИЯ ×{hud.combo}
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-display text-[11px] tracking-[0.25em] text-armor-400">РЕКОРД</div>
                <div className="font-display text-lg text-armor-300 leading-tight">{hud.hi}</div>
              </div>
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-armor-500">
              <span>ВРЕМЯ <span className="font-display text-armor-300">{hud.stageTime}с</span></span>
              <span>ТОЧНОСТЬ <span className="font-display text-armor-300">{hud.accuracy}%</span></span>
            </div>
            {hud.night && inBattle && (
              <div className="mt-1.5 text-center font-display text-[10px] tracking-[0.3em] text-[#8fb8e8]">
                ◐ НОЧНОЙ БОЙ
              </div>
            )}

            <div className="my-3 h-px bg-armor-700" />

            {/* активные эффекты */}
            <div className="space-y-1.5 text-[12px]">
              <div className={`flex items-center justify-between ${hud.frozenT > 0 ? "text-[#8fd8e8]" : "text-armor-600"}`}>
                <span className="font-display tracking-widest text-[10px]">ЗАМОРОЗКА</span>
                <span className="font-display">{hud.frozenT > 0 ? `${hud.frozenT}с` : "——"}</span>
              </div>
              <div className={`flex items-center justify-between ${hud.shovelT > 0 ? "text-flare-300" : "text-armor-600"}`}>
                <span className="font-display tracking-widest text-[10px]">КРЕПОСТЬ</span>
                <span className="font-display">{hud.shovelT > 0 ? `${hud.shovelT}с` : "——"}</span>
              </div>
              <div className={`flex items-center justify-between ${hud.shieldT > 0 ? "text-[#8fd8e8]" : "text-armor-600"}`}>
                <span className="font-display tracking-widest text-[10px]">ЩИТ</span>
                <span className="font-display">{hud.shieldT > 0 ? `${hud.shieldT}с` : "——"}</span>
              </div>
              <div className={`flex items-center justify-between ${hud.danger > 0.25 ? "text-alert-400" : "text-armor-600"}`}>
                <span className="font-display tracking-widest text-[10px]">ТРЕВОГА ШТАБА</span>
                <span className={`font-display ${hud.danger > 0.25 ? "blink-hard" : ""}`}>
                  {hud.danger > 0.66 ? "КРИТИЧЕСКАЯ" : hud.danger > 0.25 ? "АТАКА!" : "——"}
                </span>
              </div>
            </div>

            {/* страж */}
            <div className="mt-4 flex items-center justify-center gap-2 border border-armor-700 bg-armor-950/60 py-2">
              <ChiPixel size={44} alive={hud.gameOverReason !== "base"} />
              <div className="text-[10px] leading-tight text-armor-400">
                ОБЪЕКТ «ЧИХУАХУА»<br />
                <span className={`font-display tracking-widest ${hud.gameOverReason === "base" ? "text-alert-400" : "text-flare-300"}`}>
                  {hud.gameOverReason === "base" ? "УТРАЧЕН" : "ПОД ЗАЩИТОЙ"}
                </span>
              </div>
            </div>

            {/* сердца настроения */}
            <div className="mt-3 flex items-center justify-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <HeartIcon key={i} size={12} dim={hud.gameOverReason === "base" || hud.lives === 0 ? true : i >= Math.min(5, hud.lives + 1) ? true : false} />
              ))}
            </div>
          </aside>
        </main>

        <TouchControls engine={engineRef.current} />

        {/* ======= нижняя панель управления ======= */}
        <footer className="mt-4 hidden items-center justify-center gap-6 border-t border-armor-800 pt-3 sm:flex">
          <div className="flex items-center gap-2 text-[12px] text-armor-400">
            <Key>W</Key><Key>A</Key><Key>S</Key><Key>D</Key>
            <span className="text-armor-500">— манёвр</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-armor-400">
            <Key wide>SPACE</Key>
            <span className="text-armor-500">— огонь</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-armor-400">
            <Key>P</Key>
            <span className="text-armor-500">— пауза</span>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-armor-400">
            <Key>M</Key>
            <span className="text-armor-500">— звук</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
