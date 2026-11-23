import { type ReactNode, useState } from "react";
import { type Album, artFor, hash } from "../lib/desk";

/** The album's artwork from Spotify, or a generated sleeve when it has none or it fails. */
export function Cover({
  album,
  className = "",
}: {
  album: Pick<Album, "id" | "image_url">;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);
  if (album.image_url && !broken)
    return (
      <span className={`cover ${className}`}>
        <img src={album.image_url} alt="" loading="lazy" onError={() => setBroken(true)} />
      </span>
    );
  const { c1, c2, motif } = artFor(album.id);
  const h = hash(album.id);
  let g: ReactNode;
  switch (motif) {
    case "disc":
      g = (
        <>
          <circle cx="50" cy="50" r="31" fill={c2} />
          <circle cx="50" cy="50" r="4" fill={c1} />
        </>
      );
      break;
    case "bars":
      g = Array.from({ length: 6 }, (_, i) => {
        const hh = 18 + ((h >> (i * 3)) & 31) * 1.9;
        // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative bars
        return <rect key={i} x={12 + i * 13} y={88 - hh} width="8" height={hh} fill={c2} />;
      });
      break;
    case "grid":
      g = Array.from({ length: 16 }, (_, i) =>
        (h >> i) & 1 || i === 5 ? (
          <rect
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed decorative grid
            key={i}
            x={14 + (i % 4) * 19}
            y={14 + Math.floor(i / 4) * 19}
            width="15"
            height="15"
            fill={c2}
          />
        ) : null,
      );
      break;
    case "arc":
      g = <circle cx={70 + (h % 20)} cy={78 + (h % 14)} r="58" fill={c2} />;
      break;
    case "split":
      g = (
        <>
          <rect x="0" y={52 + (h % 16)} width="100" height="60" fill={c2} />
          <rect x="10" y={40 + (h % 16)} width="34" height="2" fill={c2} />
        </>
      );
      break;
    default:
      g = (
        <>
          <circle cx={28 + (h % 20)} cy={30 + (h % 18)} r="13" fill={c2} />
          <rect x="12" y="78" width={30 + (h % 40)} height="3" fill={c2} />
        </>
      );
  }
  return (
    <span className={`cover ${className}`}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect width="100" height="100" fill={c1} />
        {g}
      </svg>
    </span>
  );
}
