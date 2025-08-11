import React, { useEffect, useRef, useState } from "react";

const PROMPTS = ["vegetable","very","west","apple","an egg","the market"];

export default function App() {
  const [idx, setIdx] = useState(0);
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [recorder, setRecorder] = useState(null);
  const mediaStreamRef = useRef(null);
  const chunksRef = useRef([]);

  const target = PROMPTS[idx];

  // cleanup mic on unmount
  useEffect(() => () => {
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
  }, []);

  async function startRec() {
    setHeard("");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;

    const r = new MediaRecorder(stream, { mimeType: "audio/webm" });
    chunksRef.current = [];
    r.ondataavailable = e => chunksRef.current.push(e.data);
    r.onstop = async () => {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const resp = await fetch("/api/transcribe", { method: "POST", body: blob });
      const data = await resp.json();
      setHeard(data.text || "");
    };

    r.start();
    setRecorder(r);
    setListening(true);
  }

  function stopRec() {
    if (!recorder) return;
    recorder.stop();
    setListening(false);
    if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
  }

  const matchOk = norm(heard) === norm(target);

  return (
    <div className="min-h-screen p-6 bg-base-200">
      <div className="navbar bg-base-100 rounded-box shadow mb-6">
        <div className="flex-1 px-2 text-xl font-bold">🐝 English for Bee — Whisper Practice</div>
        <div className="flex-none">
          <button className="btn btn-ghost" onClick={() => { setHeard(""); setIdx(0); }}>Reset</button>
        </div>
      </div>

      <div className="card bg-base-100 shadow-xl p-6 w-full max-w-none rounded-none sm:rounded-lg">
        <h2 className="text-3xl font-extrabold mb-2">{target}</h2>
        <p className="text-sm text-gray-500 mb-4">Tap Listen, then Start, speak, and Stop.</p>

        <div className="flex gap-2 flex-wrap items-center">
          <button className="btn" onClick={() => speak(target)}>🔊 Listen</button>
          {!listening ? (
            <button className="btn btn-accent" onClick={startRec}>🎤 Start</button>
          ) : (
            <button className="btn btn-warning" onClick={stopRec}>⏹ Stop</button>
          )}
          <button className="btn btn-secondary" onClick={() => { setHeard(""); setIdx(i => (i+1)%PROMPTS.length); }}>
            Next
          </button>
        </div>

        <div className="mt-4">
          <div className="text-sm">Heard: <span className="font-semibold">{heard || "—"}</span></div>
          {heard && (
            <div className={`alert mt-3 ${matchOk ? "alert-success" : "alert-error"}`}>
              <span>{matchOk ? "✅ Match!" : "❌ Try again"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function norm(s){ return (s||"").toLowerCase().trim().replace(/[^a-z ]/g,""); }
function speak(text){
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "en-US";
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(u);
}
