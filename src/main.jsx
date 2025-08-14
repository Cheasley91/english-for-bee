import { ensureAuth } from "./lib/firebase"; // NEW
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

(async () => {
  // Wait for Firebase auth to finish before rendering
  try {
    await ensureAuth();
  } catch (e) {
    console.error("Firebase auth failed:", e);
  }

  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
})();
