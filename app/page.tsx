"use client";
import { useEffect, useRef, useState } from "react";

type Lane = "D" | "F" | "J" | "K";
type ChartNote = { time: number; lane: Lane };

const LANES = ["D", "F", "J", "K"] as const;
const KEY_TO_LANE: Record<string, Lane> = { d: "D", f: "F", j: "J", k: "K" };

function buildChart(): ChartNote[] {
  const notes: ChartNote[] = [];
  const L = LANES;
  const push = (t: number, lane: Lane) => notes.push({ time: t, lane });

  const intro = [8.2, 8.7, 9.2, 9.7, 10.4, 10.9, 11.4, 12.1, 12.6, 13.1, 13.8, 14.3, 14.8];
  intro.forEach((t, i) => push(t, L[i % 4]));

  const hookStarts = [180, 210, 120, 108, 144, 180, 216];
  for (const start of hookStarts) {
    for (let i = 0; i < 5; i++) push(start + i * 0.35, L[i % 4]);
    push(start + 2.0, "F");
    push(start + 2.0, "J");
    push(start + 2.5, "D");
    push(start + 2.5, "K");
  }

  const beat = 60 / 194;
  for (let bar = 0; bar < 900; bar++) {
    const t = 2 + bar * beat * 4;
    if (t > 266) break;
    const inHook = hookStarts.some((s) => t >= s - 0.3 && t <= s + 3.5);
    if (inHook) continue;
    push(t, L[bar % 4]);
    push(t + beat * 2, L[(bar + 2) % 4]);
    push(t + beat * 1, L[(bar + 2) % 4]);
    push(t + beat * 1.5, L[(bar + 3) % 4]);
  }

  const bridge = [150, 150.5, 151, 151.6, 152.1, 152.6, 153.2, 153.8, 154.4];
  bridge.forEach((t, i) => push(t, L[(i * 3) % 4]));

  const seen = new Set<string>();
  return notes
    .filter((n) => {
      const k = `${n.time.toFixed(2)}-${n.lane}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.time - b.time);
}

const CHAR_IMAGES = [
  "https://www.dropbox.com/scl/fi/ff0t04fzhplbf2wl30ml4/ad.png?rlkey=kt7oopod0h0qvx5i8layezmmb&st=6gujlakk&dl&raw=1",
  "https://www.dropbox.com/scl/fi/x77qk9fjt8qtul45bdk1t/unnamed.gif?rlkey=007wah6tou3rbeefrbil2n9lw&st=tylgktc9&dl&raw=1",
  "https://www.dropbox.com/scl/fi/x77qk9fjt8qtul45bdk1t/unnamed.gif?rlkey=007wah6tou3rbeefrbil2n9lw&st=tylgktc9&dl&raw=1",
  "https://www.dropbox.com/scl/fi/x77qk9fjt8qtul45bdk1t/unnamed.gif?rlkey=007wah6tou3rbeefrbil2n9lw&st=tylgktc9&dl&raw=1",
];

const FALL_TIME = 0.6;
const HIT_WINDOW = 0.13;

export default function DanceGame() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lanesRef = useRef<HTMLDivElement>(null);
  const charRef = useRef<HTMLImageElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);

  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [audioMissing, setAudioMissing] = useState(false);

  const stateRef = useRef({
    notes: [] as Array<ChartNote & { el?: HTMLDivElement; spawned: boolean; hit: boolean; removed: boolean }>,
    score: 0,
    combo: 0,
    raf: 0,
    charIdx: 0,
    idleTimeout: 0 as number,
  });

  const showFeedback = (txt: string, cls: "good" | "ok" | "miss") => {
    const el = feedbackRef.current;
    if (!el) return;
    el.textContent = txt;
    el.className = "feedback " + cls;
    window.clearTimeout((showFeedback as any)._t);
    (showFeedback as any)._t = window.setTimeout(() => {
      el.textContent = "";
      el.className = "feedback";
    }, 500);
  };

  const resetChart = () => {
    const s = stateRef.current;
    for (const n of s.notes) n.el?.remove();
    s.notes = buildChart().map((n) => {
      const laneEl = lanesRef.current?.querySelector(`.lane[data-lane="${n.lane}"]`);
      const el = document.createElement("div");
      el.className = "note";
      laneEl?.appendChild(el);
      return { ...n, el, spawned: false, hit: false, removed: false };
    });
    s.score = 0;
    s.combo = 0;
    setScore(0);
    setCombo(0);
  };

  useEffect(() => {
    resetChart();
    return () => {
      cancelAnimationFrame(stateRef.current.raf);
      for (const n of stateRef.current.notes) n.el?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loop = () => {
    const audio = audioRef.current;
    const lanesEl = lanesRef.current;
    if (!audio || !lanesEl) return;
    const t = audio.currentTime;
    const laneHeight = lanesEl.clientHeight - 64 - 22 - 14;

    for (const n of stateRef.current.notes) {
      if (n.removed) continue;
      if (!n.spawned && t >= n.time - FALL_TIME) {
        n.spawned = true;
        if (n.el) n.el.style.top = "-22px";
      }
      if (n.spawned && !n.hit && n.el) {
        const progress = Math.min(1, Math.max(0, (t - (n.time - FALL_TIME)) / FALL_TIME));
        n.el.style.transform = `translateY(${progress * laneHeight}px)`;
      }
      if (!n.hit && t > n.time + HIT_WINDOW) {
        n.hit = true;
        n.removed = true;
        n.el?.classList.add("miss");
        const el = n.el;
        setTimeout(() => el?.remove(), 300);
        stateRef.current.combo = 0;
        setCombo(0);
        showFeedback("MISS", "miss");
      }
    }

    if (!audio.paused) {
      stateRef.current.raf = requestAnimationFrame(loop);
    }
  };

  const handleToggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        if (audio.ended || audio.currentTime === 0) resetChart();
        await audio.play();
        setPlaying(true);
        setAudioMissing(false);
        stateRef.current.raf = requestAnimationFrame(loop);
      } catch {
        setAudioMissing(true);
      }
    } else {
      audio.pause();
      setPlaying(false);
      cancelAnimationFrame(stateRef.current.raf);
    }
  };

  const triggerLane = (lane: Lane) => {
    window.clearTimeout(stateRef.current.idleTimeout);
    const randomIdx = Math.floor(Math.random() * 3) + 1;
    stateRef.current.charIdx = randomIdx;
    if (charRef.current) charRef.current.src = CHAR_IMAGES[randomIdx];
    stateRef.current.idleTimeout = window.setTimeout(() => {
      stateRef.current.charIdx = 0;
      if (charRef.current) charRef.current.src = CHAR_IMAGES[0];
    }, 1200);

    const audio = audioRef.current;
    if (!audio || audio.paused) return;
    const t = audio.currentTime;
    const s = stateRef.current;

    let best: typeof s.notes[number] | null = null;
    let bestDelta = Infinity;
    for (const n of s.notes) {
      if (n.removed || n.hit || n.lane !== lane) continue;
      const d = Math.abs(n.time - t);
      if (d < bestDelta) {
        best = n;
        bestDelta = d;
      }
    }

    if (best && bestDelta <= HIT_WINDOW) {
      best.hit = true;
      best.removed = true;
      best.el?.classList.add("hit");
      const el = best.el;
      setTimeout(() => el?.remove(), 150);
      const quality = bestDelta < 0.04 ? "PERFECT" : bestDelta < 0.085 ? "GOOD" : "OK";
      const pts = quality === "PERFECT" ? 300 : quality === "GOOD" ? 150 : 80;
      s.score += pts + Math.floor(s.combo * 3);
      s.combo += 1;
      setScore(s.score);
      setCombo(s.combo);
      showFeedback(quality, quality === "OK" ? "ok" : "good");
    } else {
      s.combo = 0;
      setCombo(0);
      showFeedback("MISS", "miss");
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const lane = KEY_TO_LANE[e.key.toLowerCase()];
      if (!lane) return;
      triggerLane(lane);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(stateRef.current.idleTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAudioEnded = () => {
    setPlaying(false);
    cancelAnimationFrame(stateRef.current.raf);
    stateRef.current.charIdx = 0;
    if (charRef.current) charRef.current.src = CHAR_IMAGES[0];
    showFeedback("Fim de jogo!", "miss");
    window.clearTimeout((showFeedback as any)._t);
    (showFeedback as any)._t = window.setTimeout(() => {
    }, 500);
  };

  const handleTouch = (lane: Lane) => (e: React.PointerEvent) => {
    e.preventDefault();
    triggerLane(lane);
  };

  return (
    <>
      <style>{css}</style>
      <div className="dance-app">
        <section className="card game">
          <header className="hud">
            <div>🎵 <strong>Rock That Body — Black Eyed Peas</strong></div>
            <div className="pill">Pontuação: <span>{score}</span></div>
            <div className="pill">Combo: <span>{combo}</span></div>
            
          </header>
          <div className="lanes" ref={lanesRef}>
            <div className="lane" data-lane="D"><div className="keycap">D</div></div>
            <div className="lane" data-lane="F"><div className="keycap">F</div></div>
            <div className="lane" data-lane="J"><div className="keycap">J</div></div>
            <div className="lane" data-lane="K"><div className="keycap">K</div></div>
            <div className="hit-line" />
            <div className="feedback" ref={feedbackRef} />
          </div>
          <div className="touch-pad" role="group" aria-label="Controles de toque">
            {LANES.map((l) => (
              <button
                key={l}
                className={`touch-btn lane-${l}`}
                onPointerDown={handleTouch(l)}
                aria-label={`Lane ${l}`}
              >
                {l}
              </button>
            ))}
          </div>
        </section>

        <section className="card stage">
          <header className="hud">
            <div><strong>Personagem</strong></div>
            <button className="btn" onClick={handleToggle}>
              {playing ? "⏸️ Pausar" : "▶️ Iniciar"}
            </button>
          </header>
          <div className="character-wrap">
            <img id="char" ref={charRef} className="char-img" src={CHAR_IMAGES[0]} alt="Personagem" />
            <div className="floor" />
          </div>
          <div className="controls">
            <div><strong>Controles:</strong> teclas D, F, J, K — ou toque nos botões abaixo das pistas no celular.</div>
            <audio
              ref={audioRef}
              src="https://www.dropbox.com/scl/fi/ge2le2bl8jw77k4qfsiyc/rock-that-body.mp3?rlkey=aic0xg0ezxm4mtb9asswneu37&st=8edul34h&raw=1"
              preload="auto"
              onEnded={onAudioEnded}
              onError={() => setAudioMissing(true)}
            />
          </div>
        </section>
      </div>
    </>
  );
}

const css = `
.dance-app{min-height:100vh;background:radial-gradient(1200px 600px at 70% -10%, #13204a 0%, #0b1020 55%) no-repeat fixed;
  color:#e9f0ff;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;padding:12px;
  display:flex;gap:16px;flex-wrap:wrap;justify-content:center;align-items:flex-start}
.card{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,.35);width:min(640px,95vw)}
.hud{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.1);gap:8px;flex-wrap:wrap;font-size:14px}
.pill{background:rgba(255,255,255,.08);padding:6px 10px;border-radius:999px;font-weight:700}
.game{position:relative;overflow:hidden}
.lanes{position:relative;height:520px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:14px}
.lane{position:relative;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.02) 60%,rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.08);border-radius:14px;overflow:hidden}
.keycap{position:absolute;left:50%;transform:translateX(-50%);bottom:10px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);padding:6px 10px;border-radius:10px;font-weight:800}
.hit-line{position:absolute;left:14px;right:14px;bottom:64px;height:4px;border-radius:4px;background:linear-gradient(90deg,transparent,rgba(153,255,122,.8),transparent)}
.note{position:absolute;left:8px;right:8px;height:22px;border-radius:12px;background:#7cc6ff;box-shadow:0 6px 16px rgba(124,198,255,.35);transform:translateY(-100%)}
.note.hit{background:#73f806}
.note.miss{background:#ff6b6b;opacity:.7}
.feedback{position:absolute;left:50%;transform:translateX(-50%);bottom:90px;font-weight:800;font-size:20px;text-shadow:0 2px 12px rgba(0,0,0,.5)}
.feedback.good{color:#73f806}
.feedback.ok{color:#ffd166}
.feedback.miss{color:#ff6b6b}
.touch-pad{display:none;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px;border-top:1px solid rgba(255,255,255,.1)}
.touch-btn{font-size:22px;font-weight:900;padding:18px 0;border-radius:14px;color:#fff;
  background:linear-gradient(180deg,rgba(124,198,255,.3),rgba(124,198,255,.15));
  border:1px solid rgba(124,198,255,.5);cursor:pointer;touch-action:manipulation;
  -webkit-tap-highlight-color:transparent;user-select:none;transition:transform .08s ease, background .1s}
.touch-btn:active{transform:scale(.94);background:linear-gradient(180deg,rgba(115,248,6,.45),rgba(115,248,6,.2));border-color:rgba(115,248,6,.7)}
.stage{display:flex;flex-direction:column}
.character-wrap{flex:1;display:grid;place-items:center;position:relative;overflow:hidden;padding:10px;min-height:300px}
.floor{position:absolute;left:0;right:0;bottom:0;height:70px;background:linear-gradient(180deg,transparent,rgba(255,255,255,.06));border-top:1px solid rgba(255,255,255,.1)}
.char-img{width:250px;height:250px;object-fit:contain}
.controls{padding:14px;display:grid;gap:10px;font-size:14px}
.btn{cursor:pointer;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);padding:8px 12px;border-radius:10px;font-weight:700;color:inherit}
.warn{background:rgba(255,107,107,.15);border:1px solid rgba(255,107,107,.4);padding:8px 10px;border-radius:8px;font-size:13px}

@media (max-width: 820px){
  .dance-app{padding:8px;gap:10px}
  .card{width:100%}
  .hud{padding:8px 10px;font-size:13px}
  .lanes{height:46vh;min-height:320px;gap:6px;padding:10px}
  .keycap{display:none}
  .hit-line{left:10px;right:10px;bottom:18px}
  .note{left:6px;right:6px;height:18px}
  .feedback{bottom:44px;font-size:18px}
  .touch-pad{display:grid}
  .character-wrap{min-height:200px}
  .char-img{width:180px;height:180px}
  .floor{height:50px}
}

@media (hover:none) and (pointer:coarse){
  .touch-pad{display:grid}
}
`;