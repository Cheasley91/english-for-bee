import React, { useEffect, useRef, useState } from "react";

// ---------- CONFIG ----------
const PROMPTS = ["vegetable", "very", "west", "apple", "an egg", "the market"];
const STORAGE_KEY = "efb_progress_v1";

// progress shape: { xp, lessonsCompleted, streak, lastDate }
function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
      xp: 0,
      lessonsCompleted: 0,
      streak: 0,
      lastDate: null,
    };
  } catch {
    return { xp: 0, lessonsCompleted: 0, streak: 0, lastDate: null };
  }
}
function saveProgress(p) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- MAIN APP ----------
export default function App() {
  // routing between Home and Practice
  const [view, setView] = useState("home");

  // progress
  const [progress, setProgress] = useState(loadProgress);

  // practice state
  const [idx, setIdx] = useState(0);
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);

  const target = PROMPTS[idx];
  const allDone = idx >= PROMPTS.length - 1;

  // cleanup mic on unmount
  useEffect(() => () => {
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
  }, []);

  // persist progress
  useEffect(() => saveProgress(progress), [progress]);

  // ---------- MIC FLOW ----------
  async function startRec() {
    try {
      setHeard("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const r = new MediaRecorder(stream, { mimeType: "audio/webm" });
      chunksRef.current = [];
      r.ondataavailable = (e) => e.data && chunksRef.current.push(e.data);
      r.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const resp = await fetch("/api/transcribe", { method: "POST", body: blob });

          let data;
          try {
            data = await resp.json(); // { text: "..." }
          } catch {
            data = { error: "non-json", raw: await resp.text() };
          }

          if (!resp.ok) throw new Error(data?.error || `HTTP ${resp.status}`);
          setHeard(data.text || "");
          console.log("TRANSCRIBE =>", resp.status, data);
        } catch (err) {
          console.error("Transcribe error:", err);
          alert("Transcription failed. Please try again.");
          setHeard("");
        }
      };

      r.start();
      setRecorder(r);
      setListening(true);
    } catch (err) {
      console.error("Mic start error:", err.name, err.message);
      if (err.name === "NotAllowedError") {
        alert("Microphone is blocked. Click the lock icon by the URL, set Microphone to Allow, then reload the page.");
      } else if (err.name === "NotFoundError") {
        alert("No microphone found. Select a different input in your browser settings.");
      } else if (err.name === "NotReadableError") {
        alert("Your mic seems busy. Close other apps (Zoom/Teams), then reload and try again.");
      } else {
        alert("Could not access microphone. Please check permissions and try again.");
      }
    }
  }

  function stopRec() {
    if (!recorder) return;
    recorder.stop();
    setListening(false);
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach((t) => t.stop());
  }

  // ---------- MATCH / NAV ----------
  const matchOk = norm(heard) === norm(target);

  function nextPrompt() {
    // advance only when correct, otherwise encourage retry
    if (!matchOk) return alert("Try saying it again, then press Stop.");
    if (idx < PROMPTS.length - 1) {
      setHeard("");
      setIdx((i) => i + 1);
    }
  }

  function resetPractice() {
    setHeard("");
    setIdx(0);
  }

  function markSessionComplete() {
    // Count a "lesson" when Bee correctly reaches the last prompt.
    if (!matchOk) return alert("Say the last prompt correctly first, then Finish.");
    const today = todayISO();
    const prev = progress.lastDate;
    let newStreak = progress.streak || 0;
    if (prev === today) {
      // same day: keep streak as is
      newStreak = progress.streak || 1;
    } else {
      // new day
      const diffDays = dayDiff(prev, today);
      newStreak = prev ? (diffDays === 1 ? (progress.streak || 0) + 1 : 1) : 1;
    }

    const updated = {
      ...progress,
      xp: (progress.xp || 0) + 50, // award XP for finishing session
      lessonsCompleted: (progress.lessonsCompleted || 0) + 1,
      streak: newStreak,
      lastDate: today,
    };
    setProgress(updated);
    // back to home
    resetPractice();
    setView("home");
  }

  return (
    <div className="min-h-screen bg-base-200 p-0 sm:p-6">
      {/* Navbar */}
      <div className="navbar bg-base-100 rounded-none sm:rounded-box shadow mb-6">
        <div className="flex-1 px-2 text-xl font-bold">🐝 English for Bee</div>
        <div className="flex-none">
          <button className={`btn btn-ghost ${view === "home" ? "btn-active" : ""}`} onClick={() => setView("home")}>
            Home
          </button>
          <button
            className={`btn btn-ghost ${view === "practice" ? "btn-active" : ""}`}
            onClick={() => {
              resetPractice();
              setView("practice");
            }}
          >
            Practice
          </button>
        </div>
      </div>

      {/* Views */}
      {view === "home" && (
        <div className="w-full">
          {/* Hero */}
          <div className="hero bg-base-100 rounded-none sm:rounded-box shadow mb-4">
            <div className="hero-content w-full flex-col items-start">
              <h1 className="text-3xl font-extrabold">Hi Bee 👋</h1>
              <p className="text-base-content/70">
                Practice a little each day. Small steps, big progress.
              </p>
              <button className="btn btn-primary" onClick={() => setView("practice")}>
                Continue practice
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="stats shadow w-full mb-4">
            <div className="stat">
              <div className="stat-title">XP</div>
              <div className="stat-value">{progress.xp || 0}</div>
              <div className="stat-desc">+50 per finished session</div>
            </div>
            <div className="stat">
              <div className="stat-title">Lessons Completed</div>
              <div className="stat-value">{progress.lessonsCompleted || 0}</div>
            </div>
            <div className="stat">
              <div className="stat-title">Streak</div>
              <div className="stat-value">{progress.streak || 0} 🔥</div>
              <div className="stat-desc">days in a row</div>
            </div>
          </div>

          {/* Tip of the day */}
          <div className="card bg-base-100 shadow p-4">
            <h3 className="font-semibold mb-1">Tip of the day</h3>
            <p className="text-sm text-base-content/70">
              Use <b>an</b> before vowel sounds: <i>an apple</i>, <i>an egg</i>. Use <b>the</b> for something specific (e.g., <i>the market</i>).
            </p>
          </div>
        </div>
      )}

      {view === "practice" && (
        <div className="card bg-base-100 w-full max-w-none rounded-none sm:rounded-box shadow p-5 sm:p-6">
          <h2 className="text-3xl font-extrabold mb-2">{target}</h2>
          <p className="text-sm text-gray-500 mb-2">
            {idx + 1} / {PROMPTS.length}
          </p>
          <p className="text-sm text-gray-500 mb-4">Tap Listen, then Start, speak, and Stop.</p>

          <div className="flex gap-2 flex-wrap items-center">
            <button className="btn" onClick={() => speak(target)}>🔊 Listen</button>
            {!listening ? (
              <button className="btn btn-accent" onClick={startRec}>🎤 Start</button>
            ) : (
              <button className="btn btn-warning" onClick={stopRec}>⏹ Stop</button>
            )}
            <button
              className="btn btn-secondary"
              onClick={() => {
                setHeard("");
                setIdx((i) => (i + 1) % PROMPTS.length);
              }}
            >
              Skip
            </button>
            <button className="btn" onClick={() => setHeard("")}>Repeat</button>
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
              <button className="btn btn-primary" disabled={!matchOk || allDone} onClick={nextPrompt}>
                Next
              </button>
              <button className="btn btn-success" disabled={!matchOk || !allDone} onClick={markSessionComplete}>
                Finish session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- helpers ----------
function norm(s) {
  return (s || "").toLowerCase().trim().replace(/[^a-z ]/g, "");
}
function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
function dayDiff(iso1, iso2) {
  if (!iso1 || !iso2) return Infinity;
  const d1 = new Date(iso1 + "T00:00:00Z");
  const d2 = new Date(iso2 + "T00:00:00Z");
  return Math.round((d2 - d1) / 86400000);
}
