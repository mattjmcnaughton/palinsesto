"""The candidate engine and the weekly rules. Pure: no HTTP, database or clock.

The engine sorts the catalog into four rotation categories (lanes) from the
listening signals and the owner's own log history. Every candidate carries a
reason built only from those facts, never "recommended for you".
"""

from collections import Counter
from dataclasses import dataclass, field
from datetime import date

GENRES = (
    "jazz",
    "electronic",
    "rnb",
    "rock",
    "folk",
    "ambient",
    "hiphop",
    "unsorted",
)
GENRE_NAMES = {
    "jazz": "Jazz",
    "electronic": "Electronic",
    "rnb": "R&B and soul",
    "rock": "Rock",
    "folk": "Folk",
    "ambient": "Ambient",
    "hiphop": "Hip-hop",
    "unsorted": "Unsorted",
}
# Candidate lanes, then `manual` for an album added by search or by hand.
CANDIDATE_LANES = ("current", "first", "gold", "recurrent")
LANES = (*CANDIDATE_LANES, "manual")
# heavy: a keeper. keep: more from this artist. pulled: not for me.
VERDICTS = ("heavy", "keep", "pulled")
MONTHS = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
]
# Gold takes an album with at least this many of the owner's top tracks.
GOLD_TOP_TRACKS = 2


@dataclass(frozen=True)
class Album:
    id: str
    title: str
    artist_ids: tuple[str, ...]
    released: date
    seconds: int
    genre: str


@dataclass(frozen=True)
class Entry:
    album_id: str
    lane: str
    reason: str
    verdict: str | None = None


@dataclass(frozen=True)
class Week:
    id: str
    starts_on: date
    entries: tuple[Entry, ...]
    closed: bool

    @property
    def number(self) -> int:
        return week_number(self.starts_on)


@dataclass(frozen=True)
class Policy:
    min_hours: int = 4
    max_hours: int = 8
    min_currents: int = 2
    min_first_plays: int = 1
    min_gold: int = 1
    max_genre_share: float = 0.4
    no_repeat_artist: bool = True
    gold_cooldown_weeks: int = 6
    current_window_days: int = 21


@dataclass(frozen=True)
class Signals:
    """Listening signals from the connected service, mapped to catalog IDs."""

    followed_artist_ids: frozenset[str] = frozenset()
    top_artist_ids: frozenset[str] = frozenset()
    # How many of the owner's long-term top tracks are on each album.
    top_tracks: dict[str, int] = field(default_factory=dict)
    # How many recently played tracks came from each album.
    recent_tracks: dict[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class Desk:
    artists: dict[str, str]
    albums: dict[str, Album]
    # Oldest first; the last week is the one on the desk.
    weeks: tuple[Week, ...]
    policy: Policy
    signals: Signals

    @property
    def current(self) -> Week:
        return self.weeks[-1]


@dataclass(frozen=True)
class Candidate:
    album_id: str
    lane: str
    reason: str
    rank: float


@dataclass(frozen=True)
class Check:
    id: str
    label: str
    ok: bool
    value: str


def week_number(starts_on: date) -> int:
    return starts_on.isocalendar().week


def short_date(day: date) -> str:
    return f"{day.day} {MONTHS[day.month - 1]}"


def fmt_hm(seconds: int) -> str:
    minutes = round(seconds / 60)
    hours = minutes // 60
    return f"{hours} h {minutes % 60:02d} min" if hours else f"{minutes} min"


@dataclass(frozen=True)
class Mark:
    week: Week
    verdict: str | None


@dataclass
class History:
    album_last: dict[str, Mark] = field(default_factory=dict)
    # Latest week any album by the artist was logged.
    artist_week: dict[str, Week] = field(default_factory=dict)
    # Latest verdict given to any album by the artist.
    artist_verdict: dict[str, Mark] = field(default_factory=dict)


def history(desk: Desk) -> History:
    h = History()
    for week in desk.weeks:
        if not week.closed:
            continue
        for entry in week.entries:
            h.album_last[entry.album_id] = Mark(week, entry.verdict)
            album = desk.albums.get(entry.album_id)
            for artist in album.artist_ids if album else ():
                h.artist_week[artist] = week
                if entry.verdict:
                    h.artist_verdict[artist] = Mark(week, entry.verdict)
    return h


def weeks_between(earlier: Week, later: Week) -> int:
    return (later.starts_on - earlier.starts_on).days // 7


def classify(desk: Desk, h: History, album: Album) -> Candidate | None:
    policy, signals, week = desk.policy, desk.signals, desk.current

    def name(artist_id: str) -> str:
        return desk.artists.get(artist_id, "this artist")

    def found(ids) -> str | None:
        return next((a for a in album.artist_ids if a in ids), None)

    def candidate(lane: str, reason: str, rank: float) -> Candidate:
        return Candidate(album.id, lane, reason, rank)

    logged = h.album_last.get(album.id)
    days = (week.starts_on - album.released).days
    followed = found(signals.followed_artist_ids)
    top = found(signals.top_artist_ids)
    out = short_date(album.released)

    if not logged and -6 <= days <= policy.current_window_days and (followed or top):
        reason = (
            f"You follow {name(followed)}. Out {out}."
            if followed
            else f"{name(top or '')} is in your top artists. Out {out}."
        )
        return candidate("current", reason, -days)

    pulled = (logged and logged.verdict == "pulled") or any(
        (m := h.artist_verdict.get(a)) and m.verdict == "pulled"
        for a in album.artist_ids
    )
    if pulled:
        return None

    kept = next(
        (
            a
            for a in album.artist_ids
            if (m := h.artist_verdict.get(a)) and m.verdict == "keep"
        ),
        None,
    )
    if not logged and kept:
        mark = h.artist_verdict[kept]
        return candidate(
            "recurrent",
            f"You kept {name(kept)} in rotation in week {mark.week.number}.",
            mark.week.starts_on.toordinal(),
        )

    top_tracks = signals.top_tracks.get(album.id, 0)
    if (
        not logged
        and not top_tracks
        and not any(a in h.artist_week for a in album.artist_ids)
    ):
        recent = signals.recent_tracks.get(album.id)
        reason = (
            f"You played {recent} tracks from it recently. Never logged."
            if recent
            else f"New to you. {GENRE_NAMES[album.genre]}, {album.released.year}."
        )
        return candidate("first", reason, recent or 0)

    if logged and logged.verdict == "heavy":
        off = weeks_between(logged.week, week)
        if off < policy.gold_cooldown_weeks:
            return None
        return candidate(
            "gold",
            f"Heavy rotation in week {logged.week.number}. Off the log {off} weeks.",
            off,
        )
    if not logged and top_tracks >= GOLD_TOP_TRACKS:
        return candidate(
            "gold",
            f"{top_tracks} of your top tracks are on it. Never logged.",
            top_tracks / 2,
        )
    return None


def candidates(desk: Desk) -> list[Candidate]:
    """Every album that belongs in a lane this week, best first within the list."""
    h = history(desk)
    found = [c for a in desk.albums.values() if (c := classify(desk, h, a))]
    titles = {a.id: a.title for a in desk.albums.values()}
    return sorted(found, key=lambda c: (-c.rank, titles[c.album_id].casefold()))


def entry_for(desk: Desk, album_id: str) -> Entry:
    """The log entry for adding an album, with its lane and reason."""
    h = history(desk)
    album = desk.albums[album_id]
    found = classify(desk, h, album)
    if found:
        return Entry(album_id, found.lane, found.reason)
    return Entry(album_id, "manual", "Added from your library.")


def week_seconds(desk: Desk, week: Week) -> int:
    return sum(
        desk.albums[e.album_id].seconds
        for e in week.entries
        if e.album_id in desk.albums
    )


def checks(desk: Desk, week: Week) -> list[Check]:
    """The weekly rules, checked against a week's log."""
    p = desk.policy
    total = week_seconds(desk, week)
    lanes = Counter(e.lane for e in week.entries)
    genres: Counter[str] = Counter()
    artists: Counter[str] = Counter()
    for entry in week.entries:
        album = desk.albums.get(entry.album_id)
        if not album:
            continue
        # Unsorted is not a genre, so it never trips the genre rule.
        if album.genre != "unsorted":
            genres[album.genre] += album.seconds
        artists.update(album.artist_ids)
    top = genres.most_common(1)
    share = top[0][1] / total if top and total else 0
    repeat = next((a for a, n in artists.items() if n > 1), None)

    def plural(n: int, one: str, many: str) -> str:
        return one if n == 1 else many

    result = [
        Check(
            "len",
            f"{p.min_hours} to {p.max_hours} hours",
            p.min_hours * 3600 <= total <= p.max_hours * 3600,
            fmt_hm(total),
        ),
        Check(
            "current",
            f"At least {p.min_currents} "
            + plural(p.min_currents, "current", "currents"),
            lanes["current"] >= p.min_currents,
            str(lanes["current"]),
        ),
        Check(
            "first",
            f"At least {p.min_first_plays} first "
            + plural(p.min_first_plays, "play", "plays"),
            lanes["first"] >= p.min_first_plays,
            str(lanes["first"]),
        ),
        Check(
            "gold",
            f"At least {p.min_gold} from gold",
            lanes["gold"] >= p.min_gold,
            str(lanes["gold"]),
        ),
        Check(
            "genre",
            f"No genre over {round(p.max_genre_share * 100)}%",
            share <= p.max_genre_share,
            f"{GENRE_NAMES[top[0][0]]} {round(share * 100)}%" if top else "None",
        ),
    ]
    if p.no_repeat_artist:
        result.append(
            Check(
                "artist",
                "No artist twice",
                repeat is None,
                desk.artists.get(repeat, "Repeat") if repeat else "",
            )
        )
    return result


def next_week_start(closed: Week, this_monday: date) -> date:
    """The week after a closed one, or this week if the desk fell behind."""
    following = date.fromordinal(closed.starts_on.toordinal() + 7)
    return max(following, this_monday)
