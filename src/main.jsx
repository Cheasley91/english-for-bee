import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import App from "./App";
import Login from "./pages/Login";
import Register from "./pages/Register";
import { auth } from "./lib/firebase";
import "./index.css";

export function RequireAuth({ children }) {
  const [user, setUser] = useState(undefined);
  useEffect(() => {
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);
  if (user === undefined) return null;
  return user ? children : <Navigate to="/login" replace />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <App />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
