import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInAnonymously,
  EmailAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FB_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FB_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
  measurementId: import.meta.env.VITE_FB_MEASUREMENT_ID,
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
let analytics = null;
if (typeof window !== "undefined" && import.meta.env.VITE_FB_MEASUREMENT_ID) {
  analytics = getAnalytics(app);
}
export { analytics };

export async function ensureAuth() {
  if (!import.meta.env.VITE_USE_FIREBASE) return null;
  const u = auth.currentUser;
  if (u) return u;
  await signInAnonymously(auth);
  return auth.currentUser;
}

export async function upgradeAnonToEmail(email, password) {
  const user = auth.currentUser;
  if (!user) throw new Error("No current user");
  const cred = EmailAuthProvider.credential(email, password);
  return linkWithCredential(user, cred);
}

export async function loginEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function registerEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
