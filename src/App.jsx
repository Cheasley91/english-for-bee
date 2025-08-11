import React, { useEffect, useState } from "react";

// DaisyUI + Tailwind styled Bee English app (full width)
const storageKey = "bee_english_progress";
const LESSONS = [
  {
    id: "food-drinks-1",
    title: "Food & Drinks (อาหารและเครื่องดื่ม)",
    vocab: [
      { en: "apple", th: "แอปเปิล", ex: "I eat an apple." },
      { en: "rice", th: "ข้าว", ex: "We cook rice." },
      { en: "water", th: "น้ำ", ex: "I drink water." },
      { en: "vegetable", th: "ผัก", ex: "She likes vegetables." }
    ],
  },
  {
    id: "greetings-1",
    title: "Greetings & Polite Phrases (คำทักทาย/มารยาท)",
    vocab: [
      { en: "hello", th: "สวัสดี", ex: "Hello! How are you?" },
      { en: "thank you", th: "ขอบคุณ", ex: "Thank you very much." },
      { en: "please", th: "กรุณา/โปรด", ex: "Please sit down." },
      { en: "excuse me", th: "ขอโทษ/ขอทาง", ex: "Excuse me, where is the bus stop?" }
    ],
  },
  {
    id: "articles-1",
    title: "Articles: a / an / the (คำนำหน้านาม)",
    vocab: [
      { en: "a book", th: "หนังสือหนึ่งเล่ม", ex: "I read a book." },
      { en: "an egg", th: "ไข่หนึ่งฟอง", ex: "I eat an egg for breakfast." },
      { en: "the market", th: "ตลาดนั้น", ex: "We go to the market near our home." },
      { en: "the water", th: "น้ำนั้น", ex: "The water is cold." }
    ],
  },
  {
    id: "pronunciation-v",
    title: "Pronunciation: /v/ vs /w/ (เสียง วี กับ ดับเบิลยู)",
    vocab: [
      { en: "very", th: "มาก", ex: "This is very good." },
      { en: "wary", th: "ระวังตัว", ex: "Be wary of scams." },
      { en: "vest", th: "เสื้อกั๊ก", ex: "He wears a vest." },
      { en: "west", th: "ทิศตะวันตก", ex: "They live in the west." }
    ],
  },
  {
    id: "time-1",
    title: "Time Words (เวลา/ความถี่)",
    vocab: [
      { en: "today", th: "วันนี้", ex: "I work today." },
      { en: "yesterday", th: "เมื่อวาน", ex: "She studied yesterday." },
      { en: "tomorrow", th: "พรุ่งนี้", ex: "We will travel tomorrow." },
      { en: "often", th: "บ่อย", ex: "He often drinks tea." }
    ],
  },
  {
    id: "questions-1",
    title: "Basic Questions (คำถามพื้นฐาน)",
    vocab: [
      { en: "who", th: "ใคร", ex: "Who is your friend?" },
      { en: "what", th: "อะไร", ex: "What is your name?" },
      { en: "where", th: "ที่ไหน", ex: "Where do you live?" },
      { en: "when", th: "เมื่อไหร่", ex: "When do you work?" }
    ],
  },
  {
    id: "prepositions-1",
    title: "Prepositions (บุพบท)",
    vocab: [
      { en: "in", th: "ใน", ex: "The keys are in the bag." },
      { en: "on", th: "บน", ex: "The cup is on the table." },
      { en: "at", th: "ที่/เวลา", ex: "Meet me at 7 pm." },
      { en: "under", th: "ใต้", ex: "The cat is under the chair." }
    ],
  },
  {
    id: "family-1",
    title: "Family (ครอบครัว)",
    vocab: [
      { en: "mother", th: "แม่", ex: "My mother cooks dinner." },
      { en: "father", th: "พ่อ", ex: "His father works in a bank." },
      { en: "husband", th: "สามี", ex: "Her husband likes coffee." },
      { en: "wife", th: "ภรรยา", ex: "My wife studies English." }
    ],
  },
];

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
const hasSTT =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export default function App() {
  const [lessonIdx, setLessonIdx] = useState(0);
  const current = LESSONS[lessonIdx];

  const [progress, setProgress] = useState(loadProgress);
  const [view, setView] = useState("home");
  const [index, setIndex] = useState(0);
  const [voices, setVoices] = useState([]);
  const [voiceName, setVoiceName] = useState("");
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);

  // Speech-recognition state
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);

  const normalize = (s) => (s || "").toLowerCase().trim().replace(/[^a-z ]/g, "");
  const targetWord = current.vocab[index].en;

  const startListening = () => {
    if (!hasSTT) return;
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Rec();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onstart = () => setListening(true);
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript || "";
      setHeard(text);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    setHeard("");
    rec.start();
  };

  const matchOk = normalize(heard) === normalize(targetWord);

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
    setHeard(""); // Clear previous speech result
    setProgress(p => ({ ...p, xp: p.xp + 5, wordsDone: Math.min((p.wordsDone||0) + 1, current.vocab.length) }));
    if (index < current.vocab.length - 1) setIndex(index + 1);
    else setView("done");
  };

  const percent = Math.round(((index + 1) / current.vocab.length) * 100);

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
          <button className="btn btn-ghost" onClick={() => { setHeard(""); setView("home"); }}>Home</button>
          <button className="btn btn-ghost" onClick={() => { setIndex(0); setHeard(""); setView("lesson"); }}>Lesson</button>
          <button className="btn btn-ghost" onClick={() => setView("progress")}>Progress</button>
        </div>
      </div>

      <div className="flex-1 w-full grid grid-cols-1 gap-4">

        {view === "home" && (
          <div className="card bg-base-100 shadow-xl p-6 w-full max-w-none rounded-none sm:rounded-lg">
            <h2 className="card-title mb-2">Welcome, Bee! 👋</h2>
            <p className="mb-4">Learn English with daily practice tailored for Thai speakers.</p>
            <div className="flex flex-col gap-2 w-full">
              {LESSONS.map((l, i) => (
                <button
                  key={l.id}
                  className={`btn justify-start ${i===lessonIdx ? "btn-primary" : "btn-outline"}`}
                  onClick={() => {
                    setLessonIdx(i);
                    setIndex(0);
                    setHeard(""); // Clear previous speech result
                    setView("lesson");
                  }}
                >
                  {i+1}. {l.title}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-sm mt-4">
              <span>Rate</span>
              <input type="range" min="0.6" max="1.4" step="0.1" value={rate} onChange={e=>setRate(parseFloat(e.target.value))} className="range range-xs w-32"/>
              <span>Pitch</span>
              <input type="range" min="0.8" max="1.4" step="0.1" value={pitch} onChange={e=>setPitch(parseFloat(e.target.value))} className="range range-xs w-32"/>
            </div>
          </div>
        )}

        {view === "lesson" && (
          <div className="card bg-base-100 shadow-xl p-6 w-full max-w-none rounded-none sm:rounded-lg">
            <h2 className="card-title mb-2">{current.title}</h2>
            <div className="mb-2 text-sm">Progress</div>
            <progress className="progress w-full mb-4" value={percent} max="100"></progress>
            <div className="mb-4">
              <h3 className="text-3xl font-extrabold capitalize">{current.vocab[index].en}</h3>
              <p className="text-sm text-gray-500">{current.vocab[index].th}</p>
              <p className="mt-2">Example: <span className="italic">{current.vocab[index].ex}</span></p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <button className="btn" onClick={() => speak(current.vocab[index].en)}>🔊 Listen</button>

              <button
                className={`btn ${listening ? "btn-warning" : "btn-accent"}`}
                onClick={startListening}
                disabled={!hasSTT}
                title={hasSTT ? "Speak the word" : "Speech recognition not supported"}
              >
                {listening ? "🎤 Listening..." : "🎤 Speak"}
              </button>

              <span className="text-sm">
                Heard: <span className="font-semibold">{heard || "—"}</span>
              </span>

              {heard && (
                <span className={`badge ${matchOk ? "badge-success" : "badge-error"}`}>
                  {matchOk ? "✅ Match" : "❌ Try again"}
                </span>
              )}

              <button className="btn btn-secondary" onClick={nextWord}>Next</button>
            </div>
          </div>
        )}

        {view === "progress" && (
          <div className="card bg-base-100 shadow-xl p-6 space-y-3 w-full max-w-none rounded-none sm:rounded-lg">
            <h2 className="card-title mb-2">Your Progress — {current.title}</h2>
            <div className="stats shadow w-full">
              <div className="stat">
                <div className="stat-title">XP</div>
                <div className="stat-value">{progress.xp}</div>
                <div className="stat-desc">+5 per word</div>
              </div>
              <div className="stat">
                <div className="stat-title">Words Completed</div>
                <div className="stat-value">{progress.wordsDone}/{current.vocab.length}</div>
              </div>
            </div>
            <progress className="progress w-full" value={(progress.wordsDone/current.vocab.length)*100} max="100"></progress>
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
