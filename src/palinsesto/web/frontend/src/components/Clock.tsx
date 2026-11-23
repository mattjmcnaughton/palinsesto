import type { ReactElement } from "react";
import { type Album, type Desk, type Week, fmtClock } from "../lib/desk";

const arc = (r: number, a0: number, a1: number) => {
  const p = (d: number) => [r * Math.sin((d * Math.PI) / 180), -r * Math.cos((d * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};

interface Props {
  desk: Desk;
  week: Week;
  /** A candidate to preview where it would land. */
  ghost: Album | null;
  selected: string | null;
  onSelect: (albumId: string) => void;
}

/** The program clock: one turn is the maximum length, each album an arc coloured by genre. */
export function Clock({ desk, week, ghost, selected, onSelect }: Props) {
  const { policy } = desk;
  const max = policy.max_hours * 3600;
  const min = policy.min_hours * 3600;
  const deg = (sec: number) => (sec / max) * 360;
  const arcs: ReactElement[] = [];
  let cum = 0;
  const draw = (a: Album, s0: number, isGhost: boolean) => {
    const a0 = deg(s0);
    const a1 = deg(s0 + a.seconds);
    const pad = Math.min(0.7, (a1 - a0) / 4);
    const dash = isGhost ? { strokeDasharray: "2.5 2.5", opacity: 0.8 } : {};
    if (a0 < 360) {
      arcs.push(
        <path
          key={a.id + (isGhost ? "g" : "")}
          d={arc(120, a0 + pad, Math.min(a1, 360) - pad)}
          stroke={`var(--g-${a.genre})`}
          strokeWidth={!isGhost && selected === a.id ? 30 : 22}
          fill="none"
          {...dash}
          className={isGhost ? undefined : "seg"}
          onClick={isGhost ? undefined : () => onSelect(a.id)}
        >
          <title>{`${desk.artists[a.artist_ids[0]]?.name}, ${a.title}`}</title>
        </path>,
      );
    }
    if (a1 > 360)
      arcs.push(
        <path
          key={`${a.id}o`}
          d={arc(145, Math.max(a0, 360) - 360 + 0.5, Math.min(a1 - 360, 359.5) - 0.5)}
          stroke="var(--red)"
          strokeWidth="6"
          fill="none"
          {...dash}
        />,
      );
  };
  for (const e of week.entries) {
    const a = desk.albums[e.album_id];
    if (!a) continue;
    draw(a, cum, false);
    cum += a.seconds;
  }
  if (ghost) draw(ghost, cum, true);
  const shown = cum + (ghost?.seconds ?? 0);

  const ticks: ReactElement[] = [];
  for (let h = 0; h < policy.max_hours; h++) {
    const d = (h / policy.max_hours) * 360;
    const sn = Math.sin((d * Math.PI) / 180);
    const cs = -Math.cos((d * Math.PI) / 180);
    ticks.push(
      <line
        key={`t${h}`}
        x1={sn * 134}
        y1={cs * 134}
        x2={sn * 139}
        y2={cs * 139}
        stroke="var(--dim)"
        strokeWidth="1.5"
      />,
    );
    if (h % 2 === 0)
      ticks.push(
        <text
          key={`l${h}`}
          x={sn * 152}
          y={cs * 152 + 4}
          textAnchor="middle"
          className="clock-tick"
        >
          {h === 0 ? `${policy.max_hours}h` : `${h}h`}
        </text>,
      );
  }
  const ghostName = ghost ? (desk.artists[ghost.artist_ids[0]]?.name ?? "") : "";

  return (
    <svg
      className="clock"
      viewBox="-160 -160 320 320"
      role="img"
      aria-label={`Program clock: ${fmtClock(cum)} of ${policy.max_hours} hours`}
    >
      <defs>
        <pattern
          id="hatch"
          width="5"
          height="5"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width="2" height="5" fill="var(--line)" />
        </pattern>
      </defs>
      <circle r="120" fill="none" stroke="var(--well)" strokeWidth="24" />
      <path d={arc(98, 0.5, deg(min) - 0.5)} stroke="url(#hatch)" strokeWidth="10" fill="none" />
      <text x="0" y="-80" textAnchor="middle" className="clock-sub" fontSize="11">
        minimum
      </text>
      {ticks}
      {arcs}
      <text
        x="0"
        y="8"
        textAnchor="middle"
        className="clock-count"
        fill={shown > max ? "var(--red)" : "var(--text)"}
      >
        {fmtClock(shown)}
      </text>
      <text x="0" y="32" textAnchor="middle" className="clock-sub">
        {ghost
          ? `with ${ghostName.length > 26 ? `${ghostName.slice(0, 25)}…` : ghostName}`
          : `of ${fmtClock(max)}`}
      </text>
      {ghost && (
        <text x="0" y="50" textAnchor="middle" className="clock-tick">
          +{fmtClock(ghost.seconds)}
        </text>
      )}
    </svg>
  );
}
