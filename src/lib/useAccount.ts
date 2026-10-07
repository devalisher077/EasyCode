import { useCallback, useEffect, useRef, useState } from "react";
import { api, setDemoRole, supabase } from "./api";
import type { Profile, Role } from "./types";

// Mounted above the router: visiting the landing page must not discard identity.
// Only /me supplies permissions; Auth metadata and the login picker are not roles.
export function useAccount(inWorkspace: boolean) {
  const [mode, setMode] = useState<"demo" | "supabase" | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null | undefined>(
    supabase ? undefined : null,
  );
  const identity = useRef<string | null | undefined>(sessionUserId);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ready, setReady] = useState(false);
  const [healthError, setHealthError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [revision, setRevision] = useState(0);
  const [demoStarted, setDemoStarted] = useState(inWorkspace);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (inWorkspace) setDemoStarted(true);
  }, [inWorkspace]);
  useEffect(() => {
    let current = true;
    api<{ mode: "demo" | "supabase" }>("/health", undefined, {
      anonymous: true,
    })
      .then((health) => {
        if (current) {
          setMode(health.mode);
          setHealthError("");
        }
      })
      .catch(() => {
        if (current)
          setHealthError(
            "Сервер недоступен. Проверь подключение и повтори попытку.",
          );
      });
    return () => {
      current = false;
    };
  }, [revision]);
  useEffect(() => {
    const listener = supabase?.auth.onAuthStateChange((_event, session) => {
      const next = session?.user.id ?? null;
      if (identity.current === next) return;
      identity.current = next;
      // Clear synchronously on account switches, never on token refresh/focus.
      setProfile(null);
      setProfileError("");
      setReady(false);
      setSessionUserId(next);
    });
    return () => listener?.data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!mode || (mode === "supabase" && sessionUserId === undefined)) return;
    let current = true;
    if (
      (mode === "supabase" && !sessionUserId) ||
      (mode === "demo" && !demoStarted)
    ) {
      setProfile(null);
      setProfileError("");
      setReady(true);
      return;
    }
    setReady(false);
    setProfileError("");
    const expectedId = mode === "supabase" ? sessionUserId! : undefined;
    api<Profile>(
      "/me",
      undefined,
      expectedId ? { expectedUserId: expectedId } : undefined,
    )
      .then((user) => {
        if (current && (!expectedId || identity.current === expectedId))
          setProfile(user);
      })
      .catch((reason) => {
        if (current && (!expectedId || identity.current === expectedId)) {
          setProfile(null);
          setProfileError(
            reason instanceof Error
              ? reason.message
              : "Не удалось загрузить профиль.",
          );
        }
      })
      .finally(() => {
        if (current && (!expectedId || identity.current === expectedId))
          setReady(true);
      });
    return () => {
      current = false;
    };
  }, [mode, sessionUserId, demoStarted, revision]);

  const changeDemoRole = useCallback(
    (role: Role) => {
      if (mode !== "demo") return;
      setDemoRole(role);
      setProfile(null);
      setReady(false);
      refresh();
    },
    [mode, refresh],
  );

  return {
    mode,
    profile,
    sessionUserId,
    ready,
    error: healthError || profileError,
    refresh,
    changeDemoRole,
  };
}

export type Account = ReturnType<typeof useAccount>;
