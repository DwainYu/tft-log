import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { DAILY_SESSION_ID, type TrainingSession } from "../domain/types";
import {
  ensureDefaultSessions,
  getActiveSessionId,
  getSessions,
  setActiveSession,
} from "./session-service";

/**
 * App-wide training-session context. The active session is user-controlled
 * state persisted in IndexedDB (`settings.activeSessionId`) — it survives
 * refreshes and browser restarts, and switching it re-scopes every page
 * that reads it.
 */
interface SessionContextValue {
  sessions: TrainingSession[];
  activeSession: TrainingSession | undefined;
  /** Always a usable id: falls back to `daily` while the query loads. */
  activeSessionId: string;
  /** Sessions bootstrapped + queries settled. */
  ready: boolean;
  setActiveSession: (id: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    // `alive` guard: the bootstrap promise can settle after the tree is gone
    // (React would then schedule an update into a torn-down environment).
    let alive = true;
    // A blocked IndexedDB must not leave an unhandled rejection: booting
    // anyway, the page-level queries surface their own read state.
    ensureDefaultSessions()
      .catch(() => undefined)
      .then(() => {
        if (alive) setBooted(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const sessions = useLiveQuery(() => getSessions(), [booted], []);
  const activeQuery = useLiveQuery(() => getActiveSessionId(), [booted]);

  const activeSessionId = activeQuery ?? DAILY_SESSION_ID;
  const activeSession = useMemo(
    () => sessions?.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      sessions: sessions ?? [],
      activeSession,
      activeSessionId,
      ready: booted && activeQuery !== undefined,
      setActiveSession,
    }),
    [sessions, activeSession, activeSessionId, booted, activeQuery],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Sessions + active context for a page. Throws outside the provider. */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession 必须在 <SessionProvider> 内使用");
  return ctx;
}
