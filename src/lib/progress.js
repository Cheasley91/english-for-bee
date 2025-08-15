import { DateTime } from "luxon";

const TZ = "America/New_York";

export function todayStr() {
  return DateTime.now().setZone(TZ).toISODate();
}

export function xpNeededForLevel(level) {
  return Math.round(100 * Math.pow(1.5, Math.max(0, level - 1)));
}

export function computeLevel(totalXp) {
  let level = 1;
  let xp = totalXp;
  while (xp >= xpNeededForLevel(level)) {
    xp -= xpNeededForLevel(level);
    level += 1;
  }
  return { level, xpIntoLevel: xp, xpToNext: xpNeededForLevel(level) - xp };
}

export function updateStreakOnCompletion(profile) {
  const today = todayStr();
  const last = profile.lastActiveDate;
  if (!last) {
    return { streakCount: 1, lastActiveDate: today };
  }
  const dToday = DateTime.fromISO(today, { zone: TZ });
  const dLast = DateTime.fromISO(last, { zone: TZ });
  const diff = dToday.diff(dLast, "days").days;
  if (diff < 1) {
    return { streakCount: profile.streakCount, lastActiveDate: today };
  } else if (diff >= 1 && diff < 2) {
    return { streakCount: (profile.streakCount || 0) + 1, lastActiveDate: today };
  } else {
    return { streakCount: 1, lastActiveDate: today };
  }
}
