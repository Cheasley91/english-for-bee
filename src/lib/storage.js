import { collection, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db, ensureAuth } from "./firebase";
import { THAI_SEED } from "./thai-dict";

export const LESSON_HASHES_KEY = "efb_lesson_hashes_v1";
export const MAX_GENERATION_RETRIES = 3;
export const UNIQUENESS_ENABLED = true;

export function normalizeLesson(lesson) {
  if (!lesson || typeof lesson !== "object") return [];
  const acc = [];
  if (lesson.title) acc.push(String(lesson.title));
  if (Array.isArray(lesson.items)) {
    for (const it of lesson.items) {
      if (!it) continue;
      if (it.type === "text" && it.content) acc.push(String(it.content));
      if ((it.type === "word" || it.type === "phrase") && it.term) acc.push(String(it.term));
    }
  }
  if (lesson.meta) {
    if (lesson.meta.level) acc.push(String(lesson.meta.level));
    if (lesson.meta.topic) acc.push(String(lesson.meta.topic));
  }
  return acc.map((s) => s.toLowerCase().trim().replace(/\s+/g, " ")).sort();
}

export function fingerprint(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function lessonFingerprint(lesson) {
  return fingerprint(JSON.stringify(normalizeLesson(lesson)));
}

function loadHashesLS() {
  try {
    const t = localStorage.getItem(LESSON_HASHES_KEY);
    return Array.isArray(JSON.parse(t)) ? JSON.parse(t) : [];
  } catch {
    return [];
  }
}

function saveHashesLS(arr) {
  try {
    localStorage.setItem(LESSON_HASHES_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

export async function loadHashes() {
  const local = new Set(loadHashesLS());
  if (!import.meta.env.VITE_USE_FIREBASE) return local;
  try {
    const u = await ensureAuth();
    if (!u) return local;
    const snap = await getDocs(collection(db, `users/${u.uid}/hashes`));
    const arr = [];
    snap.forEach((d) => arr.push(d.id));
    return new Set(arr.length ? arr : [...local]);
  } catch {
    return local;
  }
}

export async function saveHash(fp) {
  const arr = loadHashesLS();
  if (!arr.includes(fp)) {
    arr.push(fp);
    saveHashesLS(arr);
  }
  if (!import.meta.env.VITE_USE_FIREBASE) return;
  try {
    const u = await ensureAuth();
    if (u) await setDoc(doc(db, `users/${u.uid}/hashes/${fp}`), { fingerprint: fp, createdAt: Date.now() });
  } catch {
    /* ignore */
  }
}

const PROGRESS_KEY = "efb_progress_v1";

function loadProgressLS(defaults = {}) {
  try {
    const t = localStorage.getItem(PROGRESS_KEY);
    const obj = t ? JSON.parse(t) : {};
    return { ...defaults, ...obj };
  } catch {
    return { ...defaults };
  }
}

function saveProgressLS(p) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export async function loadProgress(defaults = {}) {
  const local = loadProgressLS(defaults);
  if (!import.meta.env.VITE_USE_FIREBASE) return local;
  try {
    const u = await ensureAuth();
    if (!u) return local;
    const snap = await getDoc(doc(db, `users/${u.uid}/profiles/${u.uid}`));
    return snap.exists() ? { ...defaults, ...snap.data() } : local;
  } catch {
    return local;
  }
}

export async function saveProgress(p) {
  saveProgressLS(p);
  if (!import.meta.env.VITE_USE_FIREBASE) return;
  try {
    const u = await ensureAuth();
    if (u) await setDoc(doc(db, `users/${u.uid}/profiles/${u.uid}`), p);
  } catch {
    /* ignore */
  }
}

export function upsertVocab(term, correct, existing = {}) {
  const entry = {
    term,
    type: "word",
    seenCount: 0,
    correctCount: 0,
    mastery: 0,
    lastSeenAt: 0,
    nextReviewAt: 0,
    ...existing,
  };
  entry.seenCount += 1;
  if (correct) {
    entry.correctCount += 1;
    entry.mastery = Math.min(entry.mastery + 1, 5);
  } else {
    entry.mastery = Math.max(entry.mastery - 1, 0);
  }
  const schedule = [1, 3, 7, 14, 30];
  const idx = correct ? Math.min(entry.mastery - 1, 4) : entry.mastery;
  const days = schedule[idx] || 1;
  entry.nextReviewAt = Date.now() + days * 86400000;
  entry.lastSeenAt = Date.now();
  return entry;
}

export function translateToThaiBulk(terms = []) {
  const out = {};
  for (const t of terms) {
    const key = t?.toLowerCase().trim();
    if (!key) continue;
    if (THAI_SEED[key]) out[t] = THAI_SEED[key];
    else if (!(t in out)) out[t] = "";
  }
  return out;
}

