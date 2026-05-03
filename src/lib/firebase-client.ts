/**
 * Firebase Client SDK — Auth + Firestore (browser-side)
 * ══════════════════════════════════════════════════════
 * FULLY LAZY: nothing runs at module import time.
 * All Firebase instances are created on first function call
 * (inside useEffect / event handlers), never at the module level.
 *
 * This prevents build-time SSR failures when NEXT_PUBLIC_ vars are absent.
 */
import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore } from "firebase/firestore";

// ── Lazy singletons ───────────────────────────────────────────
let _app:       FirebaseApp | null = null;
let _auth:      Auth        | null = null;
let _firestore: Firestore   | null = null;

function getConfig() {
  return {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY            ?? "",
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN        ?? "",
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID         ?? "",
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET     ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID              ?? "",
    measurementId:     process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID     ?? "",
  };
}

async function getApp(): Promise<FirebaseApp> {
  if (_app) return _app;
  const { initializeApp, getApps } = await import("firebase/app");
  const existing = getApps();
  _app = existing.length > 0 ? existing[0]! : initializeApp(getConfig());
  return _app;
}

export async function getAuth(): Promise<Auth> {
  if (_auth) return _auth;
  const [{ getAuth: _getAuth }, app] = await Promise.all([
    import("firebase/auth"),
    getApp(),
  ]);
  _auth = _getAuth(app);
  return _auth;
}

export async function getFirestoreDB(): Promise<Firestore> {
  if (_firestore) return _firestore;
  const [{ getFirestore }, app] = await Promise.all([
    import("firebase/firestore"),
    getApp(),
  ]);
  _firestore = getFirestore(app);
  return _firestore;
}

// ── Auth helpers (all async, safe to call in useEffect) ───────
export async function signInWithGoogle(): Promise<User> {
  const { GoogleAuthProvider, signInWithPopup } = await import("firebase/auth");
  const auth = await getAuth();
  const result = await signInWithPopup(auth, new GoogleAuthProvider());
  return result.user;
}

export async function signOutUser(): Promise<void> {
  const { signOut } = await import("firebase/auth");
  const auth = await getAuth();
  await signOut(auth);
}

export async function watchAuthState(
  callback: (user: User | null) => void
): Promise<() => void> {
  const { onAuthStateChanged } = await import("firebase/auth");
  const auth = await getAuth();
  return onAuthStateChanged(auth, callback);
}

// ── GA4 — async because it requires browser env check ─────────
export async function initAnalytics() {
  const [{ getAnalytics, isSupported }, app] = await Promise.all([
    import("firebase/analytics"),
    getApp(),
  ]);
  if (await isSupported()) return getAnalytics(app);
  return null;
}
