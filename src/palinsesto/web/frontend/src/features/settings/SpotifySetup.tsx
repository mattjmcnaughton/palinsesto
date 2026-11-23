import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { ApiError, fetchJson } from "../../lib/api";
import type { Desk, SpotifyErrorCode } from "../../lib/desk";
import { deskKey, useStore } from "../../lib/store";

export const DASHBOARD = "https://developer.spotify.com/dashboard";

/** Every error people hit while setting up, what it means, and how to fix it. */
export const ERROR_HELP: Record<
  SpotifyErrorCode,
  { title: string; cause: string; fix: ReactNode }
> = {
  invalid_client: {
    title: "INVALID_CLIENT: Invalid client",
    cause: "Spotify does not recognise this client ID, or the client secret does not match it.",
    fix: (
      <>
        Open your app in the <Dash />, click <b>Settings</b>, and copy the <b>Client ID</b> and,
        after <b>View client secret</b>, the <b>Client secret</b> again. If you rotated the secret,
        paste the new one.
      </>
    ),
  },
  redirect_mismatch: {
    title: "INVALID_CLIENT: Invalid redirect URI",
    cause:
      "The redirect URI in your Spotify app is not exactly the one Palinsesto uses. Spotify shows this on its own page and never sends you back.",
    fix: (
      <>
        In the <Dash />, open your app's <b>Settings</b>, click <b>Edit</b>, paste the redirect URI
        from step 3 into <b>Redirect URIs</b>, click <b>Add</b>, then <b>Save</b> at the bottom of
        the page. It must match character for character, including the path.
      </>
    ),
  },
  access_denied: {
    title: "Sign-in cancelled",
    cause: "Spotify's consent page was closed or Cancel was pressed.",
    fix: <>Click Connect Spotify again and choose Agree.</>,
  },
  not_allowlisted: {
    title: "403: the user may not be registered",
    cause:
      "Your app is in development mode, and the Spotify account you signed in with is not on its allowlist.",
    fix: (
      <>
        In the <Dash />, open your app, go to <b>User Management</b>, and add the name and email
        address of the Spotify account you sign in with. Development mode allows at most 5 users.
        Then click Connect Spotify again.
      </>
    ),
  },
  premium_required: {
    title: "403: Premium required",
    cause:
      "The Spotify account that owns the developer app has no active Premium subscription. Development-mode apps stop working until it is renewed.",
    fix: (
      <>
        Renew Premium on the account that created the app, then click <b>Sync now</b>. Your catalog
        and log book are unaffected.
      </>
    ),
  },
  token_revoked: {
    title: "Access revoked or expired",
    cause:
      "Spotify no longer accepts Palinsesto's sign-in. Refresh tokens last six months, and removing the app under your Spotify account's Manage apps revokes it at once.",
    fix: <>Click Connect Spotify to sign in again. Nothing else needs to change.</>,
  },
};

function Dash() {
  return (
    <a className="link" href={DASHBOARD} target="_blank" rel="noreferrer">
      Spotify developer dashboard
    </a>
  );
}

const REDIRECT_PROBLEMS: Record<string, string> = {
  localhost:
    "Spotify does not accept localhost. Open Palinsesto at http://127.0.0.1 with the same port instead.",
  loopback_without_port: "Add the port to the address, such as http://127.0.0.1:8000.",
  not_https: "Spotify needs an HTTPS address, or http://127.0.0.1 with a port for local use.",
};

interface Setup {
  redirect_uri: string;
  redirect_problem: string | null;
}

export function CopyField({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy">
      <code aria-label={label}>{value}</code>
      <button
        type="button"
        className="btn sm"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            // Clipboard blocked: the value stays selectable.
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: ReactNode;
}) {
  return (
    <li className={`step${done ? " done" : ""}`}>
      <span className="step-n" aria-hidden="true">
        {done ? "✓" : n}
      </span>
      <div>
        <h4>
          {title}
          {done && <span className="sr-only"> (done)</span>}
        </h4>
        {children}
      </div>
    </li>
  );
}

/** The Spotify connection in Settings: a step-by-step guide, then Connect. */
export function SpotifySetup() {
  const { desk, workspaceId, act, busy } = useStore();
  const client = useQueryClient();
  const spotify = desk.spotify;
  const setup = useQuery({
    queryKey: ["spotify-setup", workspaceId],
    queryFn: () => fetchJson<Setup>(`/api/workspaces/${workspaceId}/spotify/setup`),
  });
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<{ code: string; message: string } | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const has = spotify.state !== "not_set_up";
  const connected = spotify.state === "connected";
  const error = spotify.state === "error" ? spotify.error : null;
  const shownError: SpotifyErrorCode | null =
    error ?? (saveError?.code === "spotify_invalid_client" ? "invalid_client" : null);
  const connectUrl = `/api/workspaces/${workspaceId}/spotify/connect`;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const next = await fetchJson<Desk>(`/api/workspaces/${workspaceId}/spotify/credentials`, {
        method: "PUT",
        body: JSON.stringify({ client_id: clientId.trim(), client_secret: secret.trim() }),
      });
      client.setQueryData(deskKey(workspaceId), next);
      setSecret("");
    } catch (err) {
      setSaveError(
        err instanceof ApiError
          ? {
              code: err.code,
              message:
                err.status === 422
                  ? "A client ID and a client secret are each 32 letters and digits. Copy them again."
                  : err.message,
            }
          : { code: "error", message: "Could not save. Try again." },
      );
    } finally {
      setSaving(false);
    }
  };

  const status = connected
    ? { lamp: "on", text: `Connected as ${spotify.account_name}` }
    : error
      ? { lamp: "air", text: "Needs attention" }
      : has
        ? { lamp: "amber", text: "App saved. Connect to finish." }
        : { lamp: "", text: "Not set up" };

  return (
    <div className="spotify">
      <div className="svc-head">
        <span className={`lamp ${status.lamp}`} />
        <span className="fl">Spotify</span>
        <span className="dim">{status.text}</span>
      </div>
      <p className="dim">
        Palinsesto uses your own Spotify developer app. Spotify supplies your follows, top artists
        and tracks, and recent plays; album search; new releases for Currents; and the weekly
        playlist. Your client secret and Spotify sign-in are stored encrypted and never shown again.
      </p>

      {shownError && (
        <div className="alert" role="alert">
          <h4>{ERROR_HELP[shownError].title}</h4>
          <p>{ERROR_HELP[shownError].cause}</p>
          <p>
            <b>Fix:</b> {ERROR_HELP[shownError].fix}
          </p>
          {error && error !== "invalid_client" && error !== "premium_required" && (
            <a className="btn primary" href={connectUrl}>
              Connect Spotify again
            </a>
          )}
        </div>
      )}

      {connected && (
        <div className="connected">
          <dl className="kv">
            <dt>Account</dt>
            <dd>{spotify.account_name}</dd>
            <dt>Client ID</dt>
            <dd className="mono">{spotify.client_id}</dd>
            <dt>Last sync</dt>
            <dd>{spotify.synced_at ? new Date(spotify.synced_at).toLocaleString() : "Never"}</dd>
          </dl>
          <div className="row-btns">
            <button
              type="button"
              className="btn primary"
              disabled={busy}
              onClick={() =>
                act("POST", "/spotify/sync", undefined, "Synced your listening from Spotify.")
              }
            >
              {busy ? "Syncing" : "Sync now"}
            </button>
            {confirmDisconnect ? (
              <>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => {
                    setConfirmDisconnect(false);
                    void act("DELETE", "/spotify", undefined, "Spotify disconnected.");
                  }}
                >
                  Forget app and sign-in
                </button>
                <button type="button" className="btn" onClick={() => setConfirmDisconnect(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmDisconnect(true)}>
                Disconnect
              </button>
            )}
          </div>
          <p className="hint">
            Disconnecting forgets the app credentials and sign-in. Your catalog, Spotify links and
            log book stay.
          </p>
        </div>
      )}

      <details className="guide" open={!connected}>
        <summary>{connected ? "Setup guide" : "Set up Spotify in five steps"}</summary>
        <ol className="steps">
          <Step n={1} title="Check Spotify Premium" done={has}>
            <p>
              The Spotify account that owns the developer app must have an active Premium
              subscription. If Premium lapses, the app stops working until it is renewed.
            </p>
          </Step>
          <Step n={2} title="Create a Spotify app" done={has}>
            <p>
              Sign in to the <Dash /> with that account and click <b>Create app</b>. Give it any
              name and description, such as “Palinsesto”. Under{" "}
              <b>Which API/SDKs are you planning to use?</b> choose <b>Web API</b>, accept the terms
              and save.
            </p>
          </Step>
          <Step n={3} title="Add this redirect URI" done={has}>
            <p>
              Paste it into <b>Redirect URIs</b> exactly as shown, click <b>Add</b>, then{" "}
              <b>Save</b>.
            </p>
            {setup.data ? (
              <>
                <CopyField value={setup.data.redirect_uri} label="Redirect URI" />
                {setup.data.redirect_problem && (
                  <p className="warn" role="alert">
                    {REDIRECT_PROBLEMS[setup.data.redirect_problem]}
                  </p>
                )}
              </>
            ) : (
              <p className="hint">
                {setup.isError ? "Could not load the redirect URI." : "Loading…"}
              </p>
            )}
            <p className="hint">
              Spotify requires HTTPS, or http://127.0.0.1 with a port for local development.
              localhost is not allowed.
            </p>
          </Step>
          <Step n={4} title="Allow your Spotify account" done={connected}>
            <p>
              In your app, open <b>User Management</b> and add the name and email of each Spotify
              account that will connect, including your own if it is not the app's owner.
              Development mode allows at most 5 users.
            </p>
          </Step>
          <Step n={5} title="Paste the credentials and connect" done={connected}>
            <p>
              In your app's <b>Settings</b>, copy the <b>Client ID</b>, then click{" "}
              <b>View client secret</b> and copy the <b>Client secret</b>.
            </p>
            <form className="creds" onSubmit={save}>
              <label className="field">
                <span className="fl">Client ID</span>
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder={spotify.client_id ?? "32 letters and digits"}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              <label className="field">
                <span className="fl">Client secret</span>
                <input
                  type="password"
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder={has ? "Saved. Paste again to replace it." : "32 letters and digits"}
                  autoComplete="off"
                />
              </label>
              <div className="row-btns">
                <button
                  type="submit"
                  className="btn"
                  disabled={saving || !clientId.trim() || !secret.trim()}
                >
                  {saving
                    ? "Checking with Spotify"
                    : has
                      ? "Replace credentials"
                      : "Save credentials"}
                </button>
                {has && !connected && (
                  <a className="btn primary" href={connectUrl}>
                    Connect Spotify
                  </a>
                )}
              </div>
              {saveError && saveError.code !== "spotify_invalid_client" && (
                <p className="warn" role="alert">
                  {saveError.message}
                </p>
              )}
            </form>
            <p className="hint">
              Connect opens Spotify's consent page. Sign in with an account from step 4 and click
              Agree; you come back here.
            </p>
          </Step>
        </ol>

        <h4 className="trouble-h">If something goes wrong</h4>
        <dl className="trouble">
          {(Object.keys(ERROR_HELP) as SpotifyErrorCode[]).map((code) => (
            <div key={code} className={code === shownError ? "now" : ""}>
              <dt>{ERROR_HELP[code].title}</dt>
              <dd>
                {ERROR_HELP[code].cause} {ERROR_HELP[code].fix}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
