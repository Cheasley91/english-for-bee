import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit as limitFn,
} from "firebase/firestore";
import { db, ensureAuth } from "./firebase";
import { THAI_SEED, backfillThai } from "./thai-dict";
import { computeLevel, updateStreakOnCompletion } from "./progress";

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

const LESSONS_KEY = "efb_lessons_v1";
const PROFILE_KEY = "efb_profile_v1";
const HASHES_KEY = "efb_hashes_v1";

export async function saveLesson(lesson, { db, uid }) {
  const id = lesson.id || Date.now().toString();
  const data = {
    title: lesson.title,
    items: lesson.items,
    fingerprint: lesson.fingerprint,
    createdAt: lesson.createdAt || Date.now(),
    completedAt: lesson.completedAt || null,
    isRepeat: lesson.isRepeat || false,
    source: lesson.source || "api",
  };
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(LESSONS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    obj[id] = { id, ...data };
    localStorage.setItem(LESSONS_KEY, JSON.stringify(obj));
    return id;
  }
  await setDoc(doc(db, `users/${uid}/lessons/${id}`), data);
  return id;
}

export async function markLessonCompleted(lessonId, { db, uid, isRepeat }) {
  const completed = {
    completedAt: Date.now(),
    status: "completed",
    isRepeat: !!isRepeat,
    source: isRepeat ? "repeat" : "api",
  };
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(LESSONS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    if (obj[lessonId]) {
      obj[lessonId] = { ...obj[lessonId], ...completed };
      localStorage.setItem(LESSONS_KEY, JSON.stringify(obj));
    }
    return;
  }
  await updateDoc(doc(db, `users/${uid}/lessons/${lessonId}`), completed);
}

export async function listLessons({ db, uid, limit = 50, order = "desc" } = {}) {
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(LESSONS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const arr = Object.values(obj).sort((a, b) =>
      order === "desc" ? (b.index || 0) - (a.index || 0) : (a.index || 0) - (b.index || 0)
    );
    return arr.slice(0, limit);
  }
  const q = query(
    collection(db, `users/${uid}/lessons`),
    orderBy("index", order),
    limitFn(limit)
  );
  const snap = await getDocs(q);
  const lessons = [];
  snap.forEach((d) => lessons.push({ id: d.id, ...d.data() }));
  return lessons;
}

export async function hasFingerprint(fp, { db, uid }) {
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(HASHES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return arr.includes(fp);
  }
  const snap = await getDoc(doc(db, `users/${uid}/hashes/${fp}`));
  return snap.exists();
}

export async function addFingerprint(fp, { db, uid }) {
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(HASHES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if (!arr.includes(fp)) {
      arr.push(fp);
      localStorage.setItem(HASHES_KEY, JSON.stringify(arr));
    }
    return;
  }
  await setDoc(doc(db, `users/${uid}/hashes/${fp}`), { fingerprint: fp, createdAt: Date.now() });
}

export async function loadProfile({ db, uid, defaults = {} }) {
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(PROFILE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return { ...defaults, ...obj };
  }
  const ref = doc(db, `users/${uid}/profiles/${uid}`);
  const snap = await getDoc(ref);
  if (snap.exists()) return { ...defaults, ...snap.data() };
  const init = { ...defaults, createdAt: Date.now(), updatedAt: Date.now() };
  await setDoc(ref, init);
  return init;
}

export async function saveProfile(partial, { db, uid }) {
  const data = { ...partial, updatedAt: Date.now() };
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(PROFILE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    const merged = { ...obj, ...data };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(merged));
    return merged;
  }
  const ref = doc(db, `users/${uid}/profiles/${uid}`);
  await setDoc(ref, data, { merge: true });
  const snap = await getDoc(ref);
  return snap.data();
}

export async function finishLessonAndAward(lesson, { db, uid }) {
  await markLessonCompleted(lesson.id, { db, uid, isRepeat: !!lesson.isRepeat });
  const fp = lesson.fingerprint;
  const isNew = !lesson.isRepeat && !(await hasFingerprint(fp, { db, uid }));
  let awarded = 0;
  if (isNew) {
    await addFingerprint(fp, { db, uid });
    awarded = 100;
    let profile = await loadProfile({ db, uid, defaults: { xp: 0, level: 1, streakCount: 0 } });
    const totalXp = (profile.xp || 0) + awarded;
    const lvlInfo = computeLevel(totalXp);
    const streak = updateStreakOnCompletion(profile);
    profile = {
      ...profile,
      xp: totalXp,
      level: lvlInfo.level,
      streakCount: streak.streakCount,
      lastActiveDate: streak.lastActiveDate,
      lessonsCompleted: (profile.lessonsCompleted || 0) + 1,
      updatedAt: Date.now(),
    };
    await saveProfile(profile, { db, uid });
  }
  return { awardedXp: awarded };
}

// ---- Linear flow helpers ----
export async function getProfile({ db, uid }) {
  return loadProfile({
    db,
    uid,
    defaults: {
      xp: 0,
      level: 1,
      streakCount: 0,
      lastActiveDate: null,
      lessonsCompleted: 0,
      nextIndex: 1,
      activeLessonId: null,
      createdAt: 0,
      updatedAt: 0,
    },
  });
}

export async function updateProfile(patch, { db, uid }) {
  return saveProfile(patch, { db, uid });
}

export async function getLesson(id, { db, uid }) {
  if (!id) return null;
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(LESSONS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj[id] || null;
  }
  const snap = await getDoc(doc(db, `users/${uid}/lessons/${id}`));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function setActiveLesson(lessonId, { db, uid }) {
  await saveProfile({ activeLessonId: lessonId }, { db, uid });
}

export async function clearActiveLesson({ db, uid }) {
  await saveProfile({ activeLessonId: null }, { db, uid });
}

export async function getActiveLesson({ db, uid }) {
  const prof = await getProfile({ db, uid });
  if (!prof.activeLessonId) return null;
  return getLesson(prof.activeLessonId, { db, uid });
}

const _progressTimers = new Map();

export async function loadLessonProgress({ db, uid, lessonId }) {
  if (!lessonId) return null;
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(LESSONS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj[lessonId]?.progress || null;
  }
  const snap = await getDoc(doc(db, `users/${uid}/lessons/${lessonId}`));
  return snap.exists() ? snap.data().progress || null : null;
}

export async function saveLessonProgress({ db, uid, lessonId, completedIndices = [], lastIdx = 0 }) {
  const unique = Array.from(new Set(completedIndices)).sort((a, b) => a - b);
  const progress = { completedIndices: unique, lastIdx, updatedAt: Date.now() };
  const key = `${uid}:${lessonId}`;
  return new Promise((resolve, reject) => {
    const run = async () => {
      try {
        if (!import.meta.env.VITE_USE_FIREBASE) {
          const raw = localStorage.getItem(LESSONS_KEY);
          const obj = raw ? JSON.parse(raw) : {};
          obj[lessonId] = obj[lessonId] || {};
          obj[lessonId].progress = progress;
          localStorage.setItem(LESSONS_KEY, JSON.stringify(obj));
        } else {
          await setDoc(doc(db, `users/${uid}/lessons/${lessonId}`), { progress }, { merge: true });
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    };
    if (_progressTimers.has(key)) clearTimeout(_progressTimers.get(key));
    _progressTimers.set(key, setTimeout(run, 250));
  });
}

export async function createLessonFromApi({ db, uid, index, meta = {} }) {
  const resp = await fetch("/api/new-lesson", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level: meta.level, topic: meta.topic }),
  });
  if (!resp.ok) throw new Error("lesson fetch failed");
  const data = await resp.json();
  let lesson = data.lesson || {};
  lesson.items = backfillThai(Array.isArray(lesson.items) ? lesson.items.slice(0, 10) : []);
  while (lesson.items.length < 10) {
    lesson.items.push({ type: "word", term: `word${lesson.items.length + 1}`, thai: "" });
  }
  const id = Date.now().toString();
  const docData = {
    index,
    title: lesson.title || "Lesson",
    items: lesson.items,
    itemsCount: 10,
    fingerprint: lesson.fingerprint,
    status: "incomplete",
    createdAt: Date.now(),
    completedAt: null,
    source: "api",
  };
  if (!import.meta.env.VITE_USE_FIREBASE) {
    const raw = localStorage.getItem(LESSONS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    obj[id] = { id, ...docData };
    localStorage.setItem(LESSONS_KEY, JSON.stringify(obj));
  } else {
    await setDoc(doc(db, `users/${uid}/lessons/${id}`), docData);
  }
  return { id, ...docData };
}

export { hasFingerprint as wasFingerprintCompleted, addFingerprint as recordFingerprint };

