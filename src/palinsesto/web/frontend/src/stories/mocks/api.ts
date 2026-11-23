/**
 * One set of MSW handlers for every story. The desk fixture (desk.json) was read
 * from the real backend by `just storybook-fixture`, so its candidates and policy
 * checks are the engine's own. A story picks a state, or edits the desk:
 *
 *   parameters: { msw: mockApi() }                          // the demo desk
 *   parameters: { msw: mockApi({ desk: "loading" }) }       // or "failed", "signed_out"
 *   parameters: { msw: mockApi({ desk: withSpotify({ state: "not_set_up" }) }) }
 *
 * Writes answer with the same desk, so buttons work without changing anything,
 * and are logged to the browser console.
 */
import { http, HttpResponse, delay } from "msw";
import type { Desk, SpotifyErrorCode, SpotifyStatus } from "../../lib/desk";
import fixture from "./desk.json";

export const WORKSPACE = "7f0c2a52-0000-4000-8000-000000000001";
export const demoDesk = fixture as unknown as Desk;
export const session = {
  user: { id: "7f0c2a52-0000-4000-8000-000000000002" },
  workspace: { id: WORKSPACE, name: "My desk", time_zone: "America/New_York" },
  csrf_token: "synthetic-storybook-csrf",
};
export const setup = {
  redirect_uri: "https://palinsesto.example/api/spotify/callback",
  redirect_problem: null as string | null,
};

type Choice<T> = T | "loading" | "failed" | "signed_out";
interface Options {
  desk?: Choice<Desk>;
  session?: Choice<typeof session>;
  setup?: Choice<typeof setup>;
  /** Answers for writes by path suffix, such as { "/spotify/credentials": failure(...) }. */
  writes?: Record<string, () => Response | Promise<Response>>;
}

export const failure = (status: number, code: string, message: string) => () =>
  HttpResponse.json({ detail: { code, message } }, { status });

async function answer<T>(choice: Choice<T>) {
  if (choice === "loading") await delay("infinite");
  if (choice === "failed")
    return HttpResponse.json(
      { detail: { code: "unavailable", message: "Synthetic outage." } },
      { status: 503 },
    );
  if (choice === "signed_out")
    return HttpResponse.json(
      { detail: { code: "invalid_credential", message: "Sign in to continue." } },
      { status: 401 },
    );
  return HttpResponse.json(choice as object);
}

const SEARCH = [
  {
    ref: "spotify:album:4synthetic0000000000aa",
    title: "Tidal Lamps",
    artists: ["Marisol Vane"],
    released: "2026-11-13",
    tracks: 9,
    image_url: null,
    in_catalog: false,
  },
  {
    ref: "spotify:album:4synthetic0000000000ab",
    title: "Low Orbit",
    artists: ["Marisol Vane"],
    released: "2021-03-05",
    tracks: 11,
    image_url: null,
    in_catalog: false,
  },
];

export function mockApi(options: Options = {}) {
  const desk = options.desk ?? demoDesk;
  const base = "/api/workspaces/:workspace";
  return [
    http.get("/api/auth/session", () =>
      answer(options.session ?? (desk === "signed_out" ? "signed_out" : session)),
    ),
    http.get(`${base}/desk`, () => answer(desk)),
    http.get(`${base}/spotify/setup`, () => answer(options.setup ?? setup)),
    http.post(`${base}/spotify/search`, () => HttpResponse.json(SEARCH)),
    http.all(`${base}/*`, async ({ request }) => {
      const path = new URL(request.url).pathname.replace(/^\/api\/workspaces\/[^/]+/, "");
      console.info("[storybook write]", request.method, path);
      const custom = options.writes?.[path];
      if (custom) return custom();
      await delay(300);
      const body = typeof desk === "string" ? demoDesk : desk;
      return HttpResponse.json(path === "/spotify/sync" ? { imported: 0, desk: body } : body);
    }),
  ];
}

/** The demo desk with a different Spotify connection. */
export function withSpotify(status: SpotifyStatus, base: Desk = demoDesk): Desk {
  return { ...base, spotify: status };
}

export const spotifyError = (error: SpotifyErrorCode): Desk =>
  withSpotify({
    state: "error",
    error,
    client_id: "0123456789abcdef0123456789abcdef",
    account_name:
      error === "premium_required" || error === "token_revoked" ? "Synthetic Listener" : null,
  });

/** The demo desk with the week on the desk replaced. */
export function withCurrentWeek(change: (w: Desk["weeks"][number]) => Desk["weeks"][number]): Desk {
  const weeks = demoDesk.weeks.map((w, i) => (i === demoDesk.weeks.length - 1 ? change(w) : w));
  return { ...demoDesk, weeks };
}
