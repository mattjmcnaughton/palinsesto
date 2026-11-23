"""The candidate engine and weekly rules, on small hand-built desks."""

from datetime import date, timedelta
from typing import get_args

from palinsesto.domains import rotation as r
from palinsesto.dtos.desk import Genre

MONDAY = date(2026, 11, 16)  # ISO week 47


def album(id_, artist, *, released=date(2000, 1, 1), seconds=2700, genre="jazz"):
    return r.Album(id_, id_.title(), (artist,), released, seconds, genre)


def week(offset, entries, *, closed=True):
    starts = MONDAY - timedelta(weeks=offset)
    return r.Week(f"w{offset}", starts, tuple(entries), closed)


NO_SIGNALS, DEFAULT_POLICY = r.Signals(), r.Policy()


def desk(albums, past=(), current=(), signals=NO_SIGNALS, policy=DEFAULT_POLICY):
    return r.Desk(
        artists={a.artist_ids[0]: a.artist_ids[0].upper() for a in albums},
        albums={a.id: a for a in albums},
        weeks=(*past, week(0, current, closed=False)),
        policy=policy,
        signals=signals,
    )


def lanes(d):
    return {c.album_id: c.lane for c in r.candidates(d)}


def test_genre_dto_matches_domain():
    assert set(get_args(Genre)) == set(r.GENRES)


def test_gold_returns_exactly_at_cooldown():
    heavy = album("heavy", "a")
    for off, expected in ((5, None), (6, "gold")):
        d = desk([heavy], past=[week(off, [r.Entry("heavy", "gold", "", "heavy")])])
        assert lanes(d).get("heavy") == expected, off
    reason = r.candidates(d)[0].reason
    assert reason == "Heavy rotation in week 41. Off the log 6 weeks."


def test_current_window_edges():
    sig = r.Signals(followed_artist_ids=frozenset({"a"}))
    policy = r.Policy(current_window_days=21)
    inside = album("inside", "a", released=MONDAY - timedelta(days=21))
    outside = album("outside", "a", released=MONDAY - timedelta(days=22))
    early = album("early", "a", released=MONDAY + timedelta(days=6))
    found = lanes(desk([inside, outside, early], signals=sig, policy=policy))
    assert found["inside"] == "current"
    assert found["early"] == "current"
    # Outside the window it is not current; the artist is followed but never
    # logged and has no top tracks, so it is a first play.
    assert found["outside"] == "first"


def test_pulled_artist_hides_every_album_but_not_currents():
    old = album("old", "a")
    other = album("other", "a")
    new = album("new", "a", released=MONDAY - timedelta(days=2))
    sig = r.Signals(followed_artist_ids=frozenset({"a"}))
    d = desk(
        [old, other, new],
        past=[week(3, [r.Entry("old", "first", "", "pulled")])],
        signals=sig,
    )
    assert lanes(d) == {"new": "current"}


def test_keep_fills_recurrents_with_unlogged_albums_only():
    kept, more = album("kept", "a"), album("more", "a")
    d = desk([kept, more], past=[week(2, [r.Entry("kept", "first", "", "keep")])])
    assert lanes(d) == {"more": "recurrent"}
    assert r.candidates(d)[0].reason == "You kept A in rotation in week 45."


def test_top_tracks_make_gold_and_one_track_makes_nothing():
    two, one = album("two", "a"), album("one", "b")
    sig = r.Signals(top_tracks={"two": 2, "one": 1})
    assert lanes(desk([two, one], signals=sig)) == {"two": "gold"}


def test_entry_for_falls_back_to_manual():
    logged = album("logged", "a")
    d = desk([logged], past=[week(1, [r.Entry("logged", "gold", "", None)])])
    assert r.entry_for(d, "logged") == r.Entry(
        "logged", "manual", "Added from your library."
    )


def test_checks_count_lanes_length_and_repeat_artist():
    a = album("a", "x", seconds=3 * 3600, genre="jazz")
    b = album("b", "x", seconds=3600, genre="rock")
    c = album("c", "y", seconds=3600, genre="unsorted")
    entries = [
        r.Entry("a", "current", ""),
        r.Entry("b", "gold", ""),
        r.Entry("c", "first", ""),
    ]
    d = desk([a, b, c], current=entries)
    checks = {c.id: c for c in r.checks(d, d.current)}
    assert checks["len"].ok and checks["len"].value == "5 h 00 min"
    assert not checks["current"].ok and checks["current"].value == "1"
    assert checks["gold"].ok and checks["first"].ok
    # Jazz is 3 of 5 hours: 60%, over the 40% cap. Unsorted never counts as a genre.
    assert not checks["genre"].ok and checks["genre"].value == "Jazz 60%"
    assert not checks["artist"].ok and checks["artist"].value == "X"


def test_unsorted_alone_never_breaks_the_genre_rule():
    a = album("a", "x", seconds=5 * 3600, genre="unsorted")
    d = desk([a], current=[r.Entry("a", "manual", "")])
    genre = next(c for c in r.checks(d, d.current) if c.id == "genre")
    assert genre.ok and genre.value == "None"


def test_next_week_catches_up_to_this_monday():
    closed = r.Week("w", MONDAY - timedelta(weeks=3), (), True)
    assert r.next_week_start(closed, MONDAY) == MONDAY
    assert r.next_week_start(
        r.Week("w", MONDAY, (), True), MONDAY
    ) == MONDAY + timedelta(days=7)
