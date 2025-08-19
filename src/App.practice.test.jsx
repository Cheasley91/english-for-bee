import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import Login from './pages/Login';

vi.stubEnv('VITE_USE_FIREBASE', '1');

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb({ uid: 'u1' });
    return () => {};
  },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({ forEach: () => {} }),
  setDoc: vi.fn(),
}));

vi.mock('./lib/firebase', () => ({
  auth: {},
  db: {},
  ensureAuth: vi.fn().mockResolvedValue({ uid: 'u1' }),
  logout: vi.fn(),
  loginEmail: vi.fn(),
}));

let progress = { completedIndices: [], lastIdx: 0 };

vi.mock('./lib/storage', () => {
  const lesson = {
    id: 'L1',
    index: 1,
    title: 'Lesson 1',
    items: Array.from({ length: 10 }, (_, i) => ({ type: 'word', term: `word${i + 1}`, thai: '' })),
  };
  return {
    loadHashes: vi.fn().mockResolvedValue(new Set()),
    upsertVocab: vi.fn(),
    translateToThaiBulk: vi.fn(() => ({})),
    getProfile: vi.fn().mockResolvedValue({ activeLessonId: 'L1' }),
    updateProfile: vi.fn(),
    getActiveLesson: vi.fn().mockResolvedValue(lesson),
    setActiveLesson: vi.fn(),
    createLessonFromApi: vi.fn(),
    finishLessonAndAward: vi.fn(),
    loadLessonProgress: vi.fn(() => progress),
    saveLessonProgress: vi.fn((p) => { progress = p; }),
  };
});

function RequireAuth({ children }) {
  const [user, setUser] = useState();
  useEffect(() => onAuthStateChanged({}, (u) => setUser(u)), []);
  if (user === undefined) return null;
  return user ? children : <Navigate to="/login" replace />;
}

describe('Practice flow', () => {
  it('Back/Next/Skip flow and order stability', async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/*"
            element={
              <RequireAuth>
                <App />
              </RequireAuth>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByRole('button', { name: /^Practice$/i }));

    expect(await screen.findByText('word1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Skip/i }));
    expect(await screen.findByText('word2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Back/i }));
    expect(await screen.findByText('word1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Home$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Practice$/i }));
    expect(await screen.findByText('word1')).toBeInTheDocument();
  });
});
