import { useState } from "react";
import type { Policy } from "../../lib/desk";
import { useStore } from "../../lib/store";
import { SpotifySetup } from "./SpotifySetup";

type NumKey = { [K in keyof Policy]: Policy[K] extends number ? K : never }[keyof Policy];
const FIELDS: {
  key: NumKey;
  label: string;
  help: string;
  min: number;
  max: number;
  step?: number;
  pct?: boolean;
}[] = [
  {
    key: "min_hours",
    label: "Minimum length",
    help: "Hours. The clock marks this with a hatched track.",
    min: 1,
    max: 12,
  },
  {
    key: "max_hours",
    label: "Maximum length",
    help: "Hours. One full turn of the clock.",
    min: 2,
    max: 16,
  },
  {
    key: "min_currents",
    label: "Currents each week",
    help: "New releases from artists you follow or play a lot.",
    min: 0,
    max: 10,
  },
  {
    key: "min_first_plays",
    label: "First plays each week",
    help: "Artists you have never logged.",
    min: 0,
    max: 10,
  },
  {
    key: "min_gold",
    label: "Gold each week",
    help: "Old favourites coming back.",
    min: 0,
    max: 10,
  },
  {
    key: "max_genre_share",
    label: "Largest genre share",
    help: "Percent of the week one genre may take.",
    min: 10,
    max: 100,
    step: 5,
    pct: true,
  },
  {
    key: "gold_cooldown_weeks",
    label: "Gold cooldown",
    help: "Weeks a heavy rotation album stays off the log before it returns.",
    min: 1,
    max: 52,
  },
  {
    key: "current_window_days",
    label: "Currents window",
    help: "Days back a release still counts as current.",
    min: 7,
    max: 90,
  },
];

export function SettingsView() {
  const { desk, act } = useStore();
  const [draft, setDraft] = useState<Policy>(desk.policy);
  const dirty = JSON.stringify(draft) !== JSON.stringify(desk.policy);

  const exportJson = () => {
    const { artists, albums, weeks } = desk;
    const blob = new Blob([JSON.stringify({ artists, albums, weeks }, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "palinsesto-catalog.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="v-settings">
      <section className="pane">
        <div className="settings">
          <h1>Settings</h1>

          <h2>Services</h2>
          <SpotifySetup />

          <h2>Rotation policy</h2>
          <p className="dim">The rules every log is checked against on the meter bridge.</p>
          <div className="fields">
            {FIELDS.map((f) => (
              <label key={f.key} className="field">
                <span className="fl">{f.label}</span>
                <input
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={f.step ?? 1}
                  value={f.pct ? Math.round(draft[f.key] * 100) : draft[f.key]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v < f.min || v > f.max) return;
                    setDraft({ ...draft, [f.key]: f.pct ? v / 100 : v });
                  }}
                />
                <span className="fh">{f.help}</span>
              </label>
            ))}
            <label className="field check">
              <input
                type="checkbox"
                checked={draft.no_repeat_artist}
                onChange={(e) => setDraft({ ...draft, no_repeat_artist: e.target.checked })}
              />
              <span className="fl">No artist twice in one week</span>
            </label>
          </div>
          <div className="row-btns pad-top">
            <button
              type="button"
              className="btn primary"
              disabled={!dirty}
              onClick={() => act("PUT", "/policy", draft, "Rotation policy saved.")}
            >
              Save policy
            </button>
            {dirty && (
              <button type="button" className="btn" onClick={() => setDraft(desk.policy)}>
                Discard changes
              </button>
            )}
          </div>

          <h2>Data</h2>
          <p className="dim">
            Your catalog and log book belong to Palinsesto, not to a streaming service. Export gives
            you every album, artist and week as JSON.
          </p>
          <div className="row-btns">
            <button type="button" className="btn" onClick={exportJson}>
              Export catalog and history
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
