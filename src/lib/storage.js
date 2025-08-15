export const LESSON_HASHES_KEY = "efb_lesson_hashes_v1";
export const MAX_GENERATION_RETRIES = 3;

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
  return acc
    .map((s) => s.toLowerCase().trim().replace(/\s+/g, " "))
    .sort();
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

export function loadHashesLS() {
  try {
    const t = localStorage.getItem(LESSON_HASHES_KEY);
    return Array.isArray(JSON.parse(t)) ? JSON.parse(t) : [];
  } catch {
    return [];
  }
}

export function saveHashesLS(arr) {
  try {
    localStorage.setItem(LESSON_HASHES_KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

const PROGRESS_KEY = "efb_progress_v1";
export function loadProgressLS(defaults) {
  try {
    const t = localStorage.getItem(PROGRESS_KEY);
    const obj = t ? JSON.parse(t) : {};
    return { ...defaults, ...obj };
  } catch {
    return { ...defaults };
  }
}

export function saveProgressLS(p) {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
