/**
 * useAuth — Lazy Firebase Auth hook
 * ════════════════════════════════════
 * Uses dynamic imports so Firebase never runs during SSR/build.
 */
"use client";

import { useState, useEffect, useRef } from "react";
import type { User } from "firebase/auth";
import { watchAuthState, signInWithGoogle, signOutUser } from "@/lib/firebase-client";

export interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user:    null,
    loading: true,
    error:   null,
  });
  // hold the unsubscribe fn returned by watchAuthState
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // watchAuthState is async — sets up listener once resolved
    let mounted = true;
    void watchAuthState((user) => {
      if (mounted) setState({ user, loading: false, error: null });
    }).then((unsub) => {
      if (mounted) unsubRef.current = unsub;
      else unsub(); // unmounted before listener set up
    });

    return () => {
      mounted = false;
      unsubRef.current?.();
    };
  }, []);

  async function login() {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      await signInWithGoogle();
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  }

  async function logout() {
    await signOutUser();
  }

  return { ...state, login, logout };
}
