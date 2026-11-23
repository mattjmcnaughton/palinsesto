import type { Decorator } from "@storybook/react-vite";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setCsrf } from "../../lib/api";
import { DeskProvider } from "../../lib/store";
import { WORKSPACE, session } from "./api";

/** Wrap a component story in the desk store, reading the story's mocked /desk. */
export const withDesk: Decorator = (Story) => {
  setCsrf(session.csrf_token);
  // A fresh cache per render keeps one story's desk out of the next.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <DeskProvider
        workspaceId={WORKSPACE}
        fallback={(state) => (
          <p className="dim pad">{state === "loading" ? "Loading…" : "Failed"}</p>
        )}
      >
        <Story />
      </DeskProvider>
    </QueryClientProvider>
  );
};

/** A fixed-height pane, as the desk lays them out. */
export const inPane =
  (width: number): Decorator =>
  (Story) => (
    <div style={{ height: "100vh", width, display: "grid", borderRight: "1px solid var(--line)" }}>
      <Story />
    </div>
  );
