import React, { useEffect, useState } from "react";

// DaisyUI + Tailwind styled Bee English app (full width)
const storageKey = "bee_english_progress";
const LESSON = {
  title: "Food & Drinks (อาหารและเครื่องดื่ม)",
  vocab: [
    { en: "apple", th: "แอปเปิล", ex: "I eat an apple." },
    { en: "rice", th: "ข้าว", ex: "We cook rice." },
    { en: "water", th: "น้ำ", ex: "I drink water." },
    { en: "vegetable", th: "ผัก", ex: "She likes vegetables." }
  ]
};

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || { xp: 0, wordsDone: 0 };
  } catch {
    return { xp: 0, wordsDone: 0 };
  }
}
function saveProgress(data) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

const hasTTS = typeof window !== "undefined" && "speechSynthesis" in window;

export default function App() {
  const [progress, setProgress] = useState(loadProgress);
  const [view, setView] = useState("home");
  const [index, setIndex] = useState(0);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);

  useEffect(() => {
    if (!hasTTS) return;
    const load = () => {
      const list = window.speechSynthesis.getVoices();
      setVoices(list);
      const preferred = [
        "Microsoft Aria Online (Natural) - English (United States)",
        "Microsoft Jenny Online (Natural) - English (United States)",
        "Google US English",
        "Samantha",
        "Daniel"
      ];
      const found = list.find(v => preferred.includes(v.name)) || list.find(v => v.lang.startsWith("en"));
      if (found) setVoiceName(found.name);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  useEffect(() => { saveProgress(progress); }, [progress]);

  const speak = (text) => {
    if (!hasTTS) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = rate;
    u.pitch = pitch;
    const v = voices.find(v => v.name === voiceName);
    if (v) u.voice = v;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const nextWord = () => {
    setProgress(p => ({ ...p, xp: p.xp + 5, wordsDone: Math.min((p.wordsDone||0) + 1, LESSON.vocab.length) }));
    if (index < LESSON.vocab.length - 1) setIndex(index + 1);
    else setView("done");
  };

  const percent = Math.round(((index + 1) / LESSON.vocab.length) * 100);

  return (
    <div className="min-h-screen p-4 bg-base-200 flex flex-col">
      {/* Navbar */}
      <div className="navbar bg-base-100 shadow mb-6 rounded-box w-full">
        <div className="flex-1 px-2 text-xl font-bold">🐝 English for Bee</div>
        <div className="flex-none gap-2 items-center">
          <select className="select select-sm select-bordered max-w-xs" value={voiceName} onChange={e => setVoiceName(e.target.value)}>
            <option value="">Default voice</option>
            {voices.filter(v=>v.lang.startsWith("en")).map(v => (
              <option key={v.name} value={v.name}>{v.name}</option>
            ))}
          </select>
          <button className="btn btn-ghost" onClick={() => setView("home")}>Home</button>
          <button className="btn btn-ghost" onClick={() => { setIndex(0); setView("lesson"); }}>Lesson</button>
          <button className="btn btn-ghost" onClick={() => setView("progress")}>Progress</button>
        </div>
      </div>

      <div className="flex-1 w-full grid grid-cols-1 gap-4">

        {view === "home" && (
          <div className="card bg-base-100 shadow-xl p-6 w-full">
            <h2 className="card-title mb-2">Welcome, Bee! 👋</h2>
            <p className="mb-4">Learn English with daily practice tailored for Thai speakers.</p>
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <button className="btn btn-primary" onClick={() => setView("lesson")}>Start Lesson</button>
              <div className="flex items-center gap-2 text-sm">
                <span>Rate</span>
                <input type="range" min="0.6" max="1.4" step="0.1" value={rate} onChange={e=>setRate(parseFloat(e.target.value))} className="range range-xs w-32"/>
                <span>Pitch</span>
                <input type="range" min="0.8" max="1.4" step="0.1" value={pitch} onChange={e=>setPitch(parseFloat(e.target.value))} className="range range-xs w-32"/>
              </div>
            </div>
          </div>
        )}

        {view === "lesson" && (
          <div className="card bg-base-100 shadow-xl p-6 w-full">
            <h2 className="card-title mb-2">{LESSON.title}</h2>
            <div className="mb-2 text-sm">Progress</div>
            <progress className="progress w-full mb-4" value={percent} max="100"></progress>
            <div className="mb-4">
              <h3 className="text-3xl font-extrabold capitalize">{LESSON.vocab[index].en}</h3>
              <p className="text-sm text-gray-500">{LESSON.vocab[index].th}</p>
              <p className="mt-2">Example: <span className="italic">{LESSON.vocab[index].ex}</span></p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button className="btn" onClick={() => speak(LESSON.vocab[index].en)}>🔊 Listen</button>
              <button className="btn btn-secondary" onClick={nextWord}>Next</button>
            </div>
          </div>
        )}

        {view === "progress" && (
          <div className="card bg-base-100 shadow-xl p-6 space-y-3 w-full">
            <h2 className="card-title mb-2">Your Progress</h2>
            <div className="stats shadow w-full">
              <div className="stat">
                <div className="stat-title">XP</div>
                <div className="stat-value">{progress.xp}</div>
                <div className="stat-desc">+5 per word</div>
              </div>
              <div className="stat">
                <div className="stat-title">Words Completed</div>
                <div className="stat-value">{progress.wordsDone}/{LESSON.vocab.length}</div>
              </div>
            </div>
            <progress className="progress w-full" value={(progress.wordsDone/LESSON.vocab.length)*100} max="100"></progress>
          </div>
        )}

        {view === "done" && (
          <div className="alert alert-success mt-4 w-full">
            <span>Lesson completed! 🎉 Great job. Check your Progress tab.</span>
          </div>
        )}
      </div>
    </div>
  );
}
