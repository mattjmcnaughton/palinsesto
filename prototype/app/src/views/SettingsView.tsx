import { useState } from 'react';
import { SERVICE_NAMES, SERVICE_ORDER } from '../domain/format';
import type { Policy } from '../domain/types';
import { useStore } from '../state/store';

type NumKey = { [K in keyof Policy]: Policy[K] extends number ? K : never }[keyof Policy];
const FIELDS: { key: NumKey; label: string; help: string; min: number; max: number; step?: number; pct?: boolean }[] = [
  { key: 'minHours', label: 'Minimum length', help: 'Hours. The clock marks this with a hatched track.', min: 1, max: 12 },
  { key: 'maxHours', label: 'Maximum length', help: 'Hours. One full turn of the clock.', min: 2, max: 16 },
  { key: 'minCurrents', label: 'Currents each week', help: 'New releases from artists you follow or play a lot.', min: 0, max: 10 },
  { key: 'minFirstPlays', label: 'First plays each week', help: 'Artists you have never logged.', min: 0, max: 10 },
  { key: 'minGold', label: 'Gold each week', help: 'Old favourites coming back.', min: 0, max: 10 },
  { key: 'maxGenreShare', label: 'Largest genre share', help: 'Percent of the week one genre may take.', min: 10, max: 100, step: 5, pct: true },
  { key: 'goldCooldownWeeks', label: 'Gold cooldown', help: 'Weeks a heavy rotation album stays off the log before it returns.', min: 1, max: 52 },
  { key: 'currentWindowDays', label: 'Currents window', help: 'Days back a release still counts as current.', min: 7, max: 90 },
];

export function SettingsView() {
  const { s, dispatch } = useStore();
  const [confirmReset, setConfirmReset] = useState(false);

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ artists: s.artists, albums: s.albums, weeks: s.weeks }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rotation-catalog.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <main className="v-settings">
      <section className="pane">
        <div className="settings">
          <h1>Settings</h1>
          <h2>Rotation policy</h2>
          <p className="dim">The rules every log is checked against on the meter bridge.</p>
          <div className="fields">
            {FIELDS.map(f => (
              <label key={f.key} className="field">
                <span className="fl">{f.label}</span>
                <input type="number" min={f.min} max={f.max} step={f.step ?? 1}
                  value={f.pct ? Math.round(s.policy[f.key] * 100) : s.policy[f.key]}
                  onChange={e => {
                    const v = Number(e.target.value);
                    if (!Number.isFinite(v) || v < f.min || v > f.max) return;
                    dispatch({ type: 'policy', patch: { [f.key]: f.pct ? v / 100 : v } });
                  }} />
                <span className="fh">{f.help}</span>
              </label>
            ))}
            <label className="field check">
              <input type="checkbox" checked={s.policy.noRepeatArtist} onChange={e => dispatch({ type: 'policy', patch: { noRepeatArtist: e.target.checked } })} />
              <span className="fl">No artist twice in one week</span>
            </label>
          </div>

          <h2>Services</h2>
          <p className="dim">Your catalog and history belong to this app. Services supply listening signals and play the music.</p>
          {SERVICE_ORDER.map(svc => (
            <div key={svc} className="svc">
              <span className={'lamp' + (s.connections[svc] ? ' on' : '')} />
              <span className="fl">{SERVICE_NAMES[svc]}</span>
              <span className="dim">{s.connections[svc] ? (svc === 'spotify' ? 'Connected. Reads follows, top artists and recent plays; writes playlists.' : 'Connected for matching.') : 'Not connected'}</span>
              <button className="btn" onClick={() => dispatch({ type: 'connection', service: svc, on: !s.connections[svc] }, `${SERVICE_NAMES[svc]} ${s.connections[svc] ? 'disconnected' : 'connected'}.`)}>{s.connections[svc] ? 'Disconnect' : 'Connect'}</button>
            </div>
          ))}

          <h2>Data</h2>
          <p className="dim">Everything is stored in this browser. Export gives you the catalog and every week as JSON, with no service required to read it.</p>
          <div className="row-btns">
            <button className="btn" onClick={exportJson}>Export catalog and history</button>
            {confirmReset
              ? <><button className="btn danger" onClick={() => { setConfirmReset(false); dispatch({ type: 'reset' }, 'Demo data restored.'); }}>Erase and restore demo data</button><button className="btn" onClick={() => setConfirmReset(false)}>Cancel</button></>
              : <button className="btn" onClick={() => setConfirmReset(true)}>Reset to demo data</button>}
          </div>
        </div>
      </section>
    </main>
  );
}
