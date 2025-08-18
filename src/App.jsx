import React, { useEffect, useRef, useState } from "react";
import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, ensureAuth, loginEmail, registerEmail, logout } from "./lib/firebase";
import {
  loadHashes,
  upsertVocab,
  translateToThaiBulk,
  getProfile,
  updateProfile,
  getActiveLesson,
  setActiveLesson,
  createLessonFromApi,
  finishLessonAndAward,
} from "./lib/storage";
import { tipOfTheDay } from "./lib/tips";
import Lessons from "./pages/Lessons";
import { computeLevel } from "./lib/progress";
// Valid OpenAI TTS voices for `tts-1`
const VALID_VOICES = ["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse"];
const DEFAULT_VOICE = "alloy";

// Silence/VAD settings
const VAD = {
  minMs: 1500,     // must capture at least this long
  silenceMs: 1200, // your preference
  maxMs: 10000,    // hard cap to avoid runaway/cost
  calibMs: 1000,   // initial noise calibration
  factor: 4.0,     // speech if RMS > baseline * factor
  hpHz: 120,       // high-pass cutoff
};

const DEFAULT_PROFILE = {
  xp: 0,
  level: 1,
  streakCount: 0,
  lastActiveDate: null,
  lessonsCompleted: 0,
  nextIndex: 1,
  activeLessonId: null,
};

/** ---------- PERSISTENCE ---------- **/
const VOCAB_KEY = "efb_vocab_v1";
function loadVocab() {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(VOCAB_KEY)) || {};
  } catch {
    return {};
  }
}
function saveVocab(v) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(VOCAB_KEY, JSON.stringify(v));
  } catch {
    /* ignore */
  }
}

// lesson shape shim removed

/** ---------- HELPERS (pure functions) ---------- **/
function norm(s) {
  return (s || "").toLowerCase().trim().replace(/[^a-z ]/g, "");
}
function rootMeanSquare(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const v = buf[i]; sum += v * v; }
  return Math.sqrt(sum / buf.length);
}

/** ---------- MAIN APP ---------- **/
export default function App() {
  // routing
  const [view, setView] = useState("login");

  // profile progress
  const [profile, setProfile] = useState(DEFAULT_PROFILE);

  // spaced vocab stats
  const [vocab, setVocab] = useState(loadVocab);

  const [currentLesson, setCurrentLesson] = useState(null);

  const levelInfo = computeLevel(profile.xp || 0);

  // known lesson hashes
  const [knownHashes, setKnownHashes] = useState(new Set());

  // dynamic lesson state (replaces hard-coded lists at runtime)
  const [prompts, setPrompts] = useState([]); // English words/phrases
  const [thaiMap, setThaiMap] = useState({}); // { en: th }
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [lessonLoading, setLessonLoading] = useState(false);
  const [genStatus, setGenStatus] = useState("");

  // practice state
  const [idx, setIdx] = useState(0);
  const [heard, setHeard] = useState("");
  const [showThai, setShowThai] = useState(false);
  const [correctIndices, setCorrectIndices] = useState(new Set());

  // TTS state
  const [voice, setVoice] = useState(DEFAULT_VOICE);
  const [ttsBusy, setTtsBusy] = useState(false);

  // recording state
  const [listening, setListening] = useState(false);
  const [seconds, setSeconds] = useState(0);       // elapsed seconds
  const [hint, setHint] = useState("");            // small VAD hint text

  const recorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);

  // Web Audio nodes for VAD
  const audioCtxRef = useRef(null);
  const sourceRef = useRef(null);
  const analyserRef = useRef(null);
  const hpFilterRef = useRef(null);
  const rafRef = useRef(null);

  // timers
  const startedAtRef = useRef(0);
  const lastVoiceMsRef = useRef(0);
  const tickTimerRef = useRef(null);
  const maxTimerRef = useRef(null);

  // derived
  const target = prompts[idx];
  const matchOk = norm(heard) === norm(target);
  const allCorrect = correctIndices.size === prompts.length;
  const unsatisfiedBefore = Array.from({ length: idx }).some((_, i) => !correctIndices.has(i));
  const tip = tipOfTheDay();

  // cleanup on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => stopAll(true), []);

  // persist vocab
  useEffect(() => saveVocab(vocab), [vocab]);

  useEffect(() => {
    if (!import.meta.env.VITE_USE_FIREBASE) return;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const p = await getProfile({ db, uid: u.uid });
        setProfile(p);
        const vSnap = await getDocs(collection(db, `users/${u.uid}/vocab`));
        const vv = {};
        vSnap.forEach((d) => (vv[d.id] = d.data()));
        if (Object.keys(vv).length) setVocab(vv);
        const hashes = await loadHashes();
        setKnownHashes(hashes);
        const active = await getActiveLesson({ db, uid: u.uid });
        if (active) {
          setCurrentLesson(active);
          prepareLesson(active);
        } else {
          setCurrentLesson(null);
        }
        setView("home");
      } else {
        setProfile(DEFAULT_PROFILE);
        setVocab(loadVocab());
        setKnownHashes(new Set());
        setCurrentLesson(null);
        setView("login");
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin() {
    try {
      await loginEmail(email, password);
    } catch (e) {
      setAuthError(e.message);
    }
  }

  async function handleRegister() {
    try {
      await registerEmail(email, password);
    } catch (e) {
      setAuthError(e.message);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } catch {
      /* ignore */
    }
    localStorage.clear();
    resetPractice();
  }

  /** ---------- TTS (OpenAI via /api/tts) with fallback ---------- **/
  async function fetchTTS(text, v) {
    const url = `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(v)}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`TTS HTTP ${resp.status}`);
    return await resp.blob(); // audio/mpeg
  }
  async function speak(text) {
    if (!text) return;
    try {
      setTtsBusy(true);
      let blob;
      try {
        blob = await fetchTTS(text, voice);
      } catch (e) {
        console.warn("TTS failed for voice", voice, e);
        if (voice !== DEFAULT_VOICE) {
          blob = await fetchTTS(text, DEFAULT_VOICE);
        } else {
          throw e;
        }
      }
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      await audio.play();
    } catch (e) {
      console.error("TTS error:", e);
      alert("Couldn’t play audio. Please try again.");
    } finally {
      setTtsBusy(false);
    }
  }

  /** ---------- Lesson helpers ---------- **/
  function prepareLesson(lesson) {
    let nextPrompts = Array.isArray(lesson.items)
      ? lesson.items.filter((i) => i.type !== "text" && i.term).map((i) => i.term)
      : [];
    const now = Date.now();
    const dueTerms = Object.values(vocab)
      .filter((v) => v.nextReviewAt && v.nextReviewAt <= now)
      .map((v) => v.term);
    const mixCount = Math.min(dueTerms.length, Math.round(nextPrompts.length * 0.3));
    nextPrompts = [...dueTerms.slice(0, mixCount), ...nextPrompts].slice(0, nextPrompts.length);
    const baseThai = {};
    lesson.items.forEach((i) => {
      if (i.type !== "text" && i.term) baseThai[i.term] = i.thai || "";
    });
    const bulk = translateToThaiBulk(nextPrompts);
    setPrompts(nextPrompts);
    setThaiMap({ ...bulk, ...baseThai });
    setIdx(0);
    setHeard("");
    setShowThai(false);
    setCorrectIndices(new Set());
  }

  async function startNextLesson() {
    setLessonLoading(true);
    setGenStatus("");
    try {
      const u = await ensureAuth().catch(() => null);
      const uid = u?.uid || "local";
      const prof = await getProfile({ db, uid });
      const lesson = await createLessonFromApi({ db, uid, index: prof.nextIndex, meta: { level: "A1", topic: "daily life" } });
      await setActiveLesson(lesson.id, { db, uid });
      await updateProfile({ nextIndex: prof.nextIndex + 1 }, { db, uid });
      setCurrentLesson(lesson);
      prepareLesson(lesson);
      const p = await getProfile({ db, uid });
      setProfile(p);
    } catch (e) {
      console.error("new-lesson error:", e);
      setGenStatus("Try again.");
      setLessonLoading(false);
      return false;
    }
    setLessonLoading(false);
    return true;
  }

  async function handleOpenLesson(lesson) {
    prepareLesson(lesson);
    setCurrentLesson(lesson);
    setView("practice");
  }

  /** ---------- RECORDING / TRANSCRIBE ---------- **/
  async function startRec() {
    try {
      setHeard("");
      setHint("Calibrating…");
      setSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      // Build MediaRecorder
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data && chunksRef.current.push(e.data);
      rec.onstop = handleStopAndTranscribe;
      rec.start();
      recorderRef.current = rec;

      // WebAudio pipeline for VAD
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = VAD.hpHz;
      hpFilterRef.current = hp;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;

      source.connect(hp).connect(analyser);

      setListening(true);
      startedAtRef.current = performance.now();
      lastVoiceMsRef.current = startedAtRef.current; // will adjust during calib

      // elapsed seconds tick
      tickTimerRef.current = setInterval(() => {
        const elapsed = Math.floor((performance.now() - startedAtRef.current) / 1000);
        setSeconds(elapsed);
      }, 250);

      // hard cap timer
      maxTimerRef.current = setTimeout(() => {
        setHint("Max time reached.");
        stopRec(); // triggers onstop → transcribe
      }, VAD.maxMs);

      // run VAD loop
      startVADLoop();
    } catch (err) {
      console.error("Mic start error:", err.name, err.message);
      alert("Please allow microphone access and try again.");
      stopAll(true);
    }
  }

  function stopRec() {
    // manual stop (also called by auto VAD)
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    setListening(false);
    stopAudioNodes();
    stopTimers();
    // stop mic tracks after recorder stops to avoid truncation
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
    }
  }

  function stopAll(silent = false) {
    try { stopRec(); } catch { /* ignore */ }
    if (!silent) setHint("");
  }

  async function handleStopAndTranscribe() {
    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const resp = await fetch("/api/transcribe", { method: "POST", body: blob });
      let data;
      try { data = await resp.json(); }
      catch { data = { error: "non-json", raw: await resp.text() }; }

      if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
      setHeard(data.text || "");
      console.log("TRANSCRIBE =>", resp.status, data);
    } catch (err) {
      console.error("Transcribe error:", err);
      alert("Transcription failed. Please try again.");
      setHeard("");
    } finally {
      setHint("");
    }
  }

  /** ---------- SIMPLE VAD (RMS + calibration) ---------- **/
  function startVADLoop() {
    const analyser = analyserRef.current;
    if (!analyser) return;

    const buf = new Float32Array(analyser.fftSize);
    let baseline = 0;
    let haveBaseline = false;

    const startTs = performance.now();

    const loop = () => {
      analyser.getFloatTimeDomainData(buf);
      const rms = rootMeanSquare(buf);

      // calibration window
      const now = performance.now();
      if (!haveBaseline) {
        const dt = now - startTs;
        // incremental average for baseline
        baseline = baseline === 0 ? rms : baseline * 0.9 + rms * 0.1;
        setHint("Calibrating…");
        if (dt >= VAD.calibMs) {
          haveBaseline = true;
          setHint("Listening…");
          lastVoiceMsRef.current = now;
        }
      } else {
        const thresh = Math.max(baseline * VAD.factor, baseline + 0.005); // guard very silent rooms
        const isSpeech = rms > thresh;

        const sinceStart = now - startedAtRef.current;
        const sinceVoice = now - lastVoiceMsRef.current;

        if (isSpeech) lastVoiceMsRef.current = now;

        // show subtle state hint
        setHint(isSpeech ? "Speaking…" : "…");

        // auto-stop only after minMs and when silence persists
        if (sinceStart >= VAD.minMs && sinceVoice >= VAD.silenceMs) {
          setHint("Silence detected.");
          stopRec(); // recorder onstop → transcribe
          return;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }

  function stopAudioNodes() {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    try { if (sourceRef.current) sourceRef.current.disconnect(); } catch { /* ignore */ }
    try { if (hpFilterRef.current) hpFilterRef.current.disconnect(); } catch { /* ignore */ }
    try { if (analyserRef.current) analyserRef.current.disconnect(); } catch { /* ignore */ }
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close(); } catch { /* ignore */ }
      audioCtxRef.current = null;
    }
  }

  function stopTimers() {
    if (tickTimerRef.current) { clearInterval(tickTimerRef.current); tickTimerRef.current = null; }
    if (maxTimerRef.current) { clearTimeout(maxTimerRef.current); maxTimerRef.current = null; }
  }

  function updateVocab(term, correct) {
    setVocab((prev) => {
      const v = { ...prev };
      const entry = upsertVocab(term, correct, v[term]);
      v[term] = entry;
      if (import.meta.env.VITE_USE_FIREBASE) {
        (async () => {
          const u = await ensureAuth();
          if (u) await setDoc(doc(db, `users/${u.uid}/vocab/${term}`), entry);
        })();
      }
      return v;
    });
  }

  /** ---------- MATCH / NAV ---------- **/
  function nextPrompt() {
    if (!matchOk || unsatisfiedBefore) return alert("Try saying it again, then try again.");
    const term = prompts[idx];
    updateVocab(term, true);
    setCorrectIndices((prev) => {
      const s = new Set(prev);
      s.add(idx);
      return s;
    });
    if (idx < prompts.length - 1) {
      setHeard("");
      setShowThai(false);
      setIdx((i) => i + 1);
    }
  }

  function resetPractice() {
    setHeard("");
    setShowThai(false);
    setIdx(0);
    setCorrectIndices(new Set());
  }

  async function markSessionComplete() {
    if (!matchOk || !allCorrect) return alert("Say each prompt correctly before finishing.");
    const term = prompts[idx];
    updateVocab(term, true);
    setCorrectIndices((prev) => {
      const s = new Set(prev);
      s.add(idx);
      return s;
    });

    const u = await ensureAuth().catch(() => null);
    const uid = u?.uid || "local";
    if (currentLesson) {
      await finishLessonAndAward(currentLesson, { db, uid });
      const p = await getProfile({ db, uid });
      setProfile(p);
      knownHashes.add(currentLesson.fingerprint);
      setKnownHashes(new Set(knownHashes));
      await startNextLesson();
    }

    resetPractice();
    setView("practice");
  }

  /** ---------- RENDER ---------- **/
  return (
    <div className="min-h-screen bg-base-200 p-0 sm:p-6">
      {/* Navbar */}
      {view !== "login" && view !== "register" && (
        <div className="navbar bg-base-100 rounded-none sm:rounded-box shadow mb-6">
          <div className="flex-1 px-2 text-xl font-bold">🐝 English for Bee</div>
          <div className="flex-none flex items-center gap-2">
            <label className="label cursor-pointer gap-2">
              <span className="label-text">Voice</span>
              <select
                className="select select-sm select-bordered"
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                title="Voice"
              >
                {VALID_VOICES.map(v => (
                  <option key={v} value={v}>
                    {v.charAt(0).toUpperCase() + v.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            <button className={`btn btn-ghost ${view === "home" ? "btn-active" : ""}`} onClick={() => setView("home")}>
              Home
            </button>
            <button
              className={`btn btn-ghost ${view === "practice" ? "btn-active" : ""}`}
              onClick={() => { resetPractice(); setView("practice"); }}
            >
              Practice
            </button>
            <button
              className={`btn btn-ghost ${view === "lessons" ? "btn-active" : ""}`}
              onClick={() => setView("lessons")}
            >
              Lessons
            </button>
            <button className="btn btn-ghost" onClick={handleLogout}>Logout</button>
          </div>
        </div>
      )}

      {/* Views */}
      {view === "login" && (
        <div className="card bg-base-100 w-full max-w-sm mx-auto shadow p-6">
          <h2 className="text-2xl font-bold mb-2">Sign in</h2>
          <input
            type="email"
            placeholder="Email"
            className="input input-bordered w-full mb-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="input input-bordered w-full mb-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {authError && <p className="text-error text-sm mb-2">{authError}</p>}
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary" onClick={handleLogin}>Login</button>
            <button className="btn" onClick={() => { setAuthError(""); setView("register"); }}>Register</button>
          </div>
        </div>
      )}

      {view === "register" && (
        <div className="card bg-base-100 w-full max-w-sm mx-auto shadow p-6">
          <h2 className="text-2xl font-bold mb-2">Register</h2>
          <input
            type="email"
            placeholder="Email"
            className="input input-bordered w-full mb-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            type="password"
            placeholder="Password"
            className="input input-bordered w-full mb-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {authError && <p className="text-error text-sm mb-2">{authError}</p>}
          <div className="flex flex-col gap-2">
            <button className="btn btn-primary" onClick={handleRegister}>Create account</button>
            <button className="btn" onClick={() => { setAuthError(""); setView("login"); }}>Back to login</button>
          </div>
        </div>
      )}

      {view === "home" && (
        <div className="w-full">
          {/* Hero */}
          <div className="hero bg-base-100 rounded-none sm:rounded-box shadow mb-4">
            <div className="hero-content w-full flex-col items-center text-center gap-2">
              <h1 className="text-3xl font-extrabold">Hi Bee 👋</h1>
              <p className="text-base-content/70">Practice a little each day. Small steps, big progress.</p>
              <div className="flex gap-2">
                {currentLesson ? (
                  <button className="btn btn-primary" onClick={() => setView("practice")}>Continue practice</button>
                ) : (
                  <button
                    className={`btn ${lessonLoading ? "btn-disabled" : "btn-primary"}`}
                    onClick={async () => { await startNextLesson(); setView("practice"); }}
                    disabled={lessonLoading}
                  >
                    {lessonLoading ? "Loading…" : "Start next lesson"}
                  </button>
                )}
              </div>
              {genStatus && <p className="text-sm text-warning mt-2">{genStatus}</p>}
            </div>
          </div>

          {/* Stats */}
          <div className="stats shadow w-full mb-4">
            <div className="stat">
              <div className="stat-title">Level</div>
              <div className="stat-value">{profile.level || 1}</div>
              <div className="stat-desc">
                <progress className="progress w-32" value={levelInfo.xpIntoLevel} max={levelInfo.xpToNext}></progress>
              </div>
            </div>
            <div className="stat">
              <div className="stat-title">XP</div>
              <div className="stat-value">{profile.xp || 0}</div>
              <div className="stat-desc">XP is awarded when you complete a new lesson.</div>
            </div>
            <div className="stat">
              <div className="stat-title">Streak</div>
              <div className="stat-value">{profile.streakCount || 0} 🔥</div>
              <div className="stat-desc">days in a row</div>
            </div>
          </div>

          {/* Tip of the day */}
          <div className="card bg-base-100 shadow p-4">
            <h3 className="font-semibold mb-1">Tip of the day</h3>
            <p className="text-sm text-base-content/70">{tip}</p>
          </div>
        </div>
      )}

      {view === "lessons" && (
        <Lessons onOpen={handleOpenLesson} />
      )}

      {view === "practice" && (
        currentLesson ? (
          <div className="card bg-base-100 w-full max-w-none rounded-none sm:rounded-box shadow p-5 sm:p-6">
            <h3 className="text-xl font-bold mb-2">Lesson #{currentLesson?.index} — {currentLesson?.title}</h3>
            <p className="text-sm text-base-content/70 mb-2">{tip}</p>
            <h2 className="text-3xl font-extrabold mb-1">{target}</h2>

            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm text-gray-500">
                {idx + 1} / {prompts.length}
              </p>
              <button className="btn btn-xs" onClick={() => setShowThai(v => !v)}>
                {showThai ? "Hide Thai" : "Show Thai"}
              </button>
              {listening && (
                <span className="badge badge-outline">
                  {hint || "Listening…"} · {seconds}s
                </span>
              )}
            </div>

            {showThai && (
              <p className="text-sm text-primary mb-2">
                Thai: <span className="font-semibold">{thaiMap[target] || "—"}</span>
              </p>
            )}

            <p className="text-sm text-gray-500 mb-4">
              Tap Listen, then Start and speak—recording will auto-stop.
            </p>

            <div className="flex gap-2 flex-wrap items-center">
              <button className="btn" onClick={() => speak(target)} disabled={ttsBusy || !target}>
                {ttsBusy ? "Loading…" : "🔊 Listen"}
              </button>
              {!listening ? (
                <button className="btn btn-accent" onClick={startRec}>🎤 Start</button>
              ) : (
                <button className="btn btn-warning" onClick={stopRec}>⏹ Stop</button>
              )}
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const term = prompts[idx];
                  updateVocab(term, false);
                  setHeard("");
                  setShowThai(false);
                  setIdx((i) => (i + 1) % prompts.length);
                }}
              >
                Skip
              </button>
              <button
                className="btn"
                onClick={() => {
                  if (idx > 0) {
                    setHeard("");
                    setShowThai(false);
                    setIdx((i) => Math.max(i - 1, 0));
                  }
                }}
                disabled={idx === 0}
              >
                Back
              </button>
            </div>

            <div className="mt-4">
              <div className="text-sm">
                Heard: <span className="font-semibold">{heard || "—"}</span>
              </div>

              {heard && (
                <div className={`alert mt-3 ${matchOk ? "alert-success" : "alert-error"}`}>
                  <span>{matchOk ? "✅ Match!" : "❌ Try again"}</span>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  className="btn btn-primary"
                  disabled={!matchOk || unsatisfiedBefore || idx >= prompts.length - 1}
                  onClick={nextPrompt}
                >
                  Next
                </button>
                <button
                  className="btn btn-success"
                  disabled={!matchOk || !allCorrect}
                  onClick={markSessionComplete}
                >
                  Finish session
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="card bg-base-100 w-full max-w-none rounded-none sm:rounded-box shadow p-5 sm:p-6 text-center">
            <p className="mb-4">No active lesson.</p>
            <button
              className={`btn ${lessonLoading ? "btn-disabled" : "btn-primary"}`}
              onClick={startNextLesson}
              disabled={lessonLoading}
            >
              {lessonLoading ? "Loading…" : "Start next lesson"}
            </button>
          </div>
        )
      )}
    </div>
  );
}
