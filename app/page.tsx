"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SpotifyPlayer from "./spotify-player";

type Mode = "focus" | "short" | "long";
type Durations = Record<Mode, number>;

const DEFAULT_DURATIONS: Durations = { focus: 25, short: 5, long: 15 };
const DEFAULT_SESSION_TARGET = 4;
const MIN_SESSION_TARGET = 1;
const MAX_SESSION_TARGET = 12;
const STORAGE_KEYS = {
  durations: "pomoflow-durations",
  sessionTarget: "pomoflow-session-target",
} as const;

const MODES: { id: Mode; label: string }[] = [
  { id: "focus", label: "Focus" },
  { id: "short", label: "Short break" },
  { id: "long", label: "Long break" },
];

function clampMinutes(value: number) {
  return Math.min(180, Math.max(1, Math.round(value || 1)));
}

function clampSessionTarget(value: number) {
  return Math.min(MAX_SESSION_TARGET, Math.max(MIN_SESSION_TARGET, Math.round(value || DEFAULT_SESSION_TARGET)));
}

function savePreference(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be disabled or full. The in-memory preference still works.
  }
}

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.9);
    gain.connect(context.destination);
    [659.25, 783.99].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      oscillator.start(context.currentTime + index * 0.13);
      oscillator.stop(context.currentTime + 0.9);
    });
    window.setTimeout(() => void context.close(), 1100);
  } catch {
    // Audio can be blocked until the user interacts; the timer still completes normally.
  }
}

export default function Home() {
  const [durations, setDurations] = useState<Durations>(DEFAULT_DURATIONS);
  const [mode, setMode] = useState<Mode>("focus");
  const [remaining, setRemaining] = useState(DEFAULT_DURATIONS.focus * 60);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [sessionTarget, setSessionTarget] = useState(DEFAULT_SESSION_TARGET);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const deadlineRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const savedDurations = window.localStorage.getItem(STORAGE_KEYS.durations);
        const savedSessionTarget = window.localStorage.getItem(STORAGE_KEYS.sessionTarget);
        if (savedDurations) {
          const parsed = JSON.parse(savedDurations) as Partial<Durations>;
          const next = {
            focus: clampMinutes(parsed.focus ?? DEFAULT_DURATIONS.focus),
            short: clampMinutes(parsed.short ?? DEFAULT_DURATIONS.short),
            long: clampMinutes(parsed.long ?? DEFAULT_DURATIONS.long),
          };
          setDurations(next);
          setRemaining(next.focus * 60);
        }
        if (savedSessionTarget) {
          setSessionTarget(clampSessionTarget(Number(savedSessionTarget)));
        }
      } catch {
        // Keep sensible defaults if browser storage is unavailable.
      }
    });
    return () => { active = false; };
  }, []);

  const switchMode = useCallback((nextMode: Mode) => {
    setMode(nextMode);
    setRunning(false);
    deadlineRef.current = null;
    finishedRef.current = false;
    setRemaining(durations[nextMode] * 60);
  }, [durations]);

  const finishTimer = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setRunning(false);
    deadlineRef.current = null;
    playChime();

    if (mode === "focus") {
      setCompleted((value) => {
        const next = value + 1;
        const nextMode: Mode = next % sessionTarget === 0 ? "long" : "short";
        setMode(nextMode);
        setRemaining(durations[nextMode] * 60);
        return next;
      });
    } else {
      setMode("focus");
      setRemaining(durations.focus * 60);
    }
  }, [durations, mode, sessionTarget]);

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (!deadlineRef.current) return;
      const next = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) finishTimer();
    };
    tick();
    const interval = window.setInterval(tick, 250);
    return () => window.clearInterval(interval);
  }, [finishTimer, running]);

  useEffect(() => {
    document.title = `${formatTime(remaining)} · ${MODES.find((item) => item.id === mode)?.label} · Pomoflow`;
  }, [mode, remaining]);

  const totalSeconds = durations[mode] * 60;
  const progress = Math.max(0, Math.min(100, ((totalSeconds - remaining) / totalSeconds) * 100));
  const cyclePosition = completed % sessionTarget;

  function toggleTimer() {
    finishedRef.current = false;
    if (running) {
      setRunning(false);
      deadlineRef.current = null;
      return;
    }
    deadlineRef.current = Date.now() + remaining * 1000;
    setRunning(true);
  }

  function resetTimer() {
    setRunning(false);
    deadlineRef.current = null;
    finishedRef.current = false;
    setRemaining(durations[mode] * 60);
  }

  function updateDuration(key: Mode, value: number) {
    const next = { ...durations, [key]: clampMinutes(value) };
    setDurations(next);
    savePreference(STORAGE_KEYS.durations, JSON.stringify(next));
    if (key === mode && !running) setRemaining(next[key] * 60);
  }

  function updateSessionTarget(value: number) {
    const next = clampSessionTarget(value);
    setSessionTarget(next);
    setCompleted((current) => current % next);
    savePreference(STORAGE_KEYS.sessionTarget, String(next));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#timer" aria-label="Pomoflow home">
          <span className="brand-mark" aria-hidden="true"><span /></span>
          <span>Pomoflow</span>
        </a>
        <button className="settings-button" type="button" onClick={() => setSettingsOpen((value) => !value)} aria-expanded={settingsOpen} aria-controls="timer-settings">
          <span aria-hidden="true">⌁</span> Timer settings
        </button>
      </header>

      <section className="hero-copy" aria-labelledby="page-title">
        <p className="eyebrow">Focus, set to music</p>
        <h1 id="page-title">Find your rhythm.</h1>
        <p>One timer. One soundtrack. Deep work without the clutter.</p>
      </section>

      {settingsOpen ? (
        <section className="settings-panel" id="timer-settings" aria-label="Timer duration settings">
          <div>
            <p className="panel-kicker">Session lengths</p>
            <p className="settings-note">Saved on this device.</p>
          </div>
          <div className="duration-fields">
            {MODES.map((item) => (
              <label key={item.id}>
                <span>{item.label}</span>
                <span className="number-field"><input type="number" min="1" max="180" inputMode="numeric" value={durations[item.id]} onChange={(event) => updateDuration(item.id, Number(event.target.value))} /><em>min</em></span>
              </label>
            ))}
            <label>
              <span>Sessions per cycle</span>
              <span className="number-field"><input type="number" min={MIN_SESSION_TARGET} max={MAX_SESSION_TARGET} inputMode="numeric" value={sessionTarget} onChange={(event) => updateSessionTarget(Number(event.target.value))} aria-describedby="session-target-help" /><em>sessions</em></span>
            </label>
          </div>
          <p className="settings-help" id="session-target-help">A long break starts after this many focus sessions.</p>
        </section>
      ) : null}

      <div className="workspace-grid">
        <section className="timer-card" id="timer" aria-label="Pomodoro timer">
          <div className="mode-tabs" role="tablist" aria-label="Timer mode">
            {MODES.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={mode === item.id} onClick={() => switchMode(item.id)}>{item.label}</button>
            ))}
          </div>

          <div className="timer-stage">
            <p className="timer-label">{mode === "focus" ? "Current focus" : mode === "short" ? "Take a breath" : "Long reset"}</p>
            <output className="timer-value" aria-live="off">{formatTime(remaining)}</output>
            <div className="progress-track" aria-label={`${Math.round(progress)}% complete`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
              <span style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="timer-actions">
            <button className="primary-action" type="button" onClick={toggleTimer}>{running ? "Pause" : `Start ${mode === "focus" ? "focus" : "break"}`}<span aria-hidden="true">{running ? "Ⅱ" : "▶"}</span></button>
            <button className="secondary-action" type="button" onClick={resetTimer}>Reset</button>
          </div>

          <div className="cycle-row">
            <div>
              <span className="cycle-label">Today’s cycle</span>
              <strong>{cyclePosition} of {sessionTarget} sessions</strong>
            </div>
            <div className="cycle-dots" aria-label={`${cyclePosition} of ${sessionTarget} focus sessions completed`}>
              {Array.from({ length: sessionTarget }, (_, dot) => <span key={dot} className={dot < cyclePosition ? "complete" : dot === cyclePosition ? "current" : ""} />)}
            </div>
          </div>
        </section>

        <SpotifyPlayer />
      </div>

      <footer>
        <span>Designed for focus. Timer preferences stay on this device.</span>
        <span>Spotify playback requires a Premium account.</span>
      </footer>
    </main>
  );
}
