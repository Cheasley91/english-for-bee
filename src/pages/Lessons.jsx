import React, { useEffect, useState } from "react";
import { listLessons } from "../lib/storage";
import { ensureAuth, db } from "../lib/firebase";

export default function Lessons({ onRepeat }) {
  const [lessons, setLessons] = useState([]);

  useEffect(() => {
    (async () => {
      const u = await ensureAuth();
      if (!u) return;
      const { lessons } = await listLessons({ db, uid: u.uid, limit: 200 });
      setLessons(lessons);
    })();
  }, []);

  return (
    <div className="card bg-base-100 w-full shadow p-4">
      <h2 className="text-2xl font-bold mb-4">Lessons</h2>
      <ul className="space-y-2">
        {lessons.map((lsn) => (
          <li key={lsn.id} className="flex justify-between items-center border-b pb-1">
            <div>
              <div className="font-semibold">{lsn.title}</div>
              <div className="text-xs text-gray-500">
                {new Date(lsn.createdAt).toLocaleDateString()} · {lsn.items ? lsn.items.length : 0} items {lsn.completedAt ? "· completed" : ""}
              </div>
            </div>
            <button className="btn btn-sm" onClick={() => onRepeat(lsn)}>
              Repeat
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
