import { useQuery } from "@tanstack/react-query";
import { createRootRoute, useRouterState } from "@tanstack/react-router";
import { SCREENS, type Screen, Shell } from "../features/shell/Shell";
import { ApiError, readSession } from "../lib/api";
import { DeskProvider } from "../lib/store";

// The session gate and the desk stay mounted across screens; the route only picks one.
export const Route = createRootRoute({ component: Root, notFoundComponent: () => null });

function Root() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [first, second] = path.replace(/^\//, "").split("/");
  const screen: Screen = SCREENS.find(([s]) => s === first)?.[0] ?? "log";
  return <App screen={screen} albumId={screen === "library" ? second : undefined} />;
}

export function App({ screen, albumId }: { screen: Screen; albumId?: string }) {
  const session = useQuery({ queryKey: ["session"], queryFn: readSession, retry: false });
  if (session.data)
    return (
      <DeskProvider
        workspaceId={session.data.workspace.id}
        fallback={(state, retry) => (
          <Gate>
            {state === "loading" ? (
              <output className="dim">Loading your desk…</output>
            ) : (
              <>
                <p>Could not load your desk.</p>
                <button type="button" className="btn" onClick={retry}>
                  Try again
                </button>
              </>
            )}
          </Gate>
        )}
      >
        <Shell screen={screen} albumId={albumId} />
      </DeskProvider>
    );
  const signedOut = session.error instanceof ApiError && session.error.status === 401;
  return (
    <Gate>
      {session.isPending ? (
        <output className="dim">Checking sign-in…</output>
      ) : signedOut ? (
        <a className="btn primary" href="/api/auth/login">
          Sign in
        </a>
      ) : (
        <>
          <p>Could not check your sign-in.</p>
          <button type="button" className="btn" onClick={() => session.refetch()}>
            Try again
          </button>
        </>
      )}
    </Gate>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  return (
    <main className="gate">
      <h1 className="mark">
        <span className="lamp" />
        Palinsesto
      </h1>
      <p className="dim">A radio programmer's desk for one weekly mix of whole albums.</p>
      <div className="gate-acts">{children}</div>
    </main>
  );
}
