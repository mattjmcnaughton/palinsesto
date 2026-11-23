import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";
import { ApiError, fetchJson } from "./api";
import type { Desk } from "./desk";

export interface Toast {
  id: number;
  msg: string;
  error?: boolean;
}

export interface Store {
  desk: Desk;
  workspaceId: string;
  /** A write under /api/workspaces/{id}. Its response (the whole desk) replaces the cache. */
  act: (method: string, path: string, body?: unknown, message?: string) => Promise<boolean>;
  /** A call that returns something other than the desk, such as a Spotify search. */
  call: <T>(method: string, path: string, body?: unknown) => Promise<T | null>;
  busy: boolean;
  toast: Toast | null;
  say: (msg: string, error?: boolean) => void;
  dismiss: () => void;
}

const StoreCtx = createContext<Store | null>(null);

export function useStore(): Store {
  const store = useContext(StoreCtx);
  if (!store) throw new Error("useStore outside DeskProvider");
  return store;
}

export const deskKey = (workspaceId: string) => ["desk", workspaceId];

export function DeskProvider({
  workspaceId,
  children,
  fallback,
}: {
  workspaceId: string;
  children: ReactNode;
  fallback: (state: "loading" | "failed", retry: () => void) => ReactNode;
}) {
  const client = useQueryClient();
  const base = `/api/workspaces/${workspaceId}`;
  const query = useQuery({
    queryKey: deskKey(workspaceId),
    queryFn: () => fetchJson<Desk>(`${base}/desk`),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const say = useCallback((msg: string, error = false) => {
    setToast({ id: Date.now(), msg, error });
  }, []);

  const call = useCallback(
    async <T,>(method: string, path: string, body?: unknown): Promise<T | null> => {
      setBusy(true);
      try {
        return await fetchJson<T>(base + path, {
          method,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        say(error instanceof ApiError ? error.message : "Something went wrong.", true);
        // The server may have stored a new connection state, such as an error code.
        void client.invalidateQueries({ queryKey: deskKey(workspaceId) });
        return null;
      } finally {
        setBusy(false);
      }
    },
    [base, client, say, workspaceId],
  );

  const act = useCallback(
    async (method: string, path: string, body?: unknown, message?: string) => {
      const result = await call<Desk | { desk: Desk }>(method, path, body);
      if (!result) return false;
      client.setQueryData(deskKey(workspaceId), "desk" in result ? result.desk : result);
      if (message) say(message);
      return true;
    },
    [call, client, say, workspaceId],
  );

  const desk = query.data;
  const store = useMemo(
    () =>
      desk
        ? {
            desk,
            workspaceId,
            act,
            call,
            busy,
            toast,
            say,
            dismiss: () => setToast(null),
          }
        : null,
    [desk, workspaceId, act, call, busy, toast, say],
  );
  if (!store) return <>{fallback(query.isError ? "failed" : "loading", () => query.refetch())}</>;
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}
