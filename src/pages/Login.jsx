import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth, loginEmail } from "../lib/firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleLogin() {
    setError("");
    try {
      await loginEmail(email, password);
      navigate("/");
    } catch (e) {
      setError(e.message.replace("Firebase: ", ""));
    }
  }

  async function handleResetPassword() {
    setError("");
    setMsg("");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMsg("Reset email sent");
    } catch (e) {
      setError(e.message.replace("Firebase: ", ""));
    }
  }

  return (
    <div className="min-h-screen bg-base-200 p-0 sm:p-6">
      <div className="navbar bg-base-100 rounded-none sm:rounded-box shadow mb-6">
        <div className="flex-1 px-2 text-xl font-bold">🐝 English for Bee</div>
      </div>
      <div className="card bg-base-100 w-full max-w-sm mx-auto shadow p-6">
        <h2 className="text-2xl font-bold mb-2">Sign in</h2>
        <input
          type="email"
          placeholder="Email"
          className="input input-bordered w-full mb-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          className="input input-bordered w-full mb-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-error text-sm mb-2">{error}</p>}
        <div className="flex flex-col gap-2 mb-2">
          <button className="btn btn-primary" onClick={handleLogin}>Login</button>
          <button className="btn" onClick={() => navigate("/register")}>Go to Register</button>
        </div>
        <button className="link link-primary text-sm" onClick={handleResetPassword}>
          Forgot password?
        </button>
      </div>
      {(msg || error) && (
        <div className="toast toast-top toast-center">
          {msg && (
            <div className="alert alert-success">
              <span>{msg}</span>
            </div>
          )}
          {error && (
            <div className="alert alert-error">
              <span>{error}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
