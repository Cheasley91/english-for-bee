import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import React, { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { describe, it, expect, vi } from 'vitest';
import App from './App';
import Login from './pages/Login';

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth, cb) => {
    cb(null);
    return () => {};
  },
}));

vi.mock('./lib/firebase', () => ({
  auth: {},
  db: {},
  ensureAuth: vi.fn(),
  logout: vi.fn(),
  loginEmail: vi.fn(),
}));

vi.mock('./lib/storage', () => ({
  loadHashes: vi.fn().mockResolvedValue(new Set()),
  upsertVocab: vi.fn(),
  translateToThaiBulk: vi.fn(() => ({})),
  getProfile: vi.fn(),
  updateProfile: vi.fn(),
  getActiveLesson: vi.fn(),
  setActiveLesson: vi.fn(),
  createLessonFromApi: vi.fn(),
  finishLessonAndAward: vi.fn(),
}));

function RequireAuth({ children }) {
  const [user, setUser] = useState();
  useEffect(() => onAuthStateChanged({}, (u) => setUser(u)), []);
  if (user === undefined) return null;
  return user ? children : <Navigate to="/login" replace />;
}

describe('Auth smoke test', () => {
  it('renders Login page when signed out', async () => {
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

    expect(await screen.findByText(/Sign in/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    expect(screen.queryByText(/Practice/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lessons/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Home/)).not.toBeInTheDocument();
  });
});
