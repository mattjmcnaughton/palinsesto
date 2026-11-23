"""Make Storybook's desk fixture from the prototype seed, through the real API code.

The candidates and policy checks in the fixture are computed by the backend's
candidate engine, so stories show what the server would. Run with `just
storybook-fixture`, which pipes the prototype seed in and writes
src/palinsesto/web/frontend/src/stories/mocks/desk.json. Needs a migrated,
disposable database whose name contains "test" in PALINSESTO_TEST_DATABASE_URL.
Every verdict, note and listening signal in the seed is invented.
"""

import asyncio
import json
import os
import sys
from datetime import UTC, date, datetime
from uuid import NAMESPACE_URL, uuid4, uuid5

from sqlalchemy import insert, select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from palinsesto.domains.rotation import Policy
from palinsesto.models.accounts import workspaces
from palinsesto.models.catalog import album_artists, albums, artists, service_links
from palinsesto.models.connections import signals
from palinsesto.models.weeks import log_entries, weeks
from palinsesto.repositories import desk as repo
from palinsesto.services.browser_auth import provision
from palinsesto.services.desk import view


def stable(kind: str, key: str):
    return uuid5(NAMESPACE_URL, f"palinsesto-storybook:{kind}:{key}")


async def build(seed: dict, url: str) -> dict:
    assert "test" in url.rsplit("/", 1)[-1], "Use a disposable test database."
    engine = create_async_engine(url)
    async with engine.connect() as conn, conn.begin():
        session = AsyncSession(bind=conn)
        user = await provision(session, "https://storybook.test/", uuid4().hex)
        workspace = await session.scalar(
            select(workspaces.c.id).where(workspaces.c.owner_id == user)
        )
        artist_ids = {}
        for key, a in seed["artists"].items():
            artist_ids[key] = await session.scalar(
                insert(artists)
                .values(
                    workspace_id=workspace, name=a["name"], uuid=stable("artist", key)
                )
                .returning(artists.c.id)
            )
            for link in a["links"]:
                await session.execute(
                    insert(service_links).values(
                        workspace_id=workspace,
                        artist_id=artist_ids[key],
                        service=link["service"],
                        ref=link["ref"],
                        matched_by=link["matchedBy"],
                    )
                )
        album_ids = {}
        for key, a in seed["albums"].items():
            album_ids[key] = await session.scalar(
                insert(albums)
                .values(
                    workspace_id=workspace,
                    uuid=stable("album", key),
                    title=a["title"],
                    released=date.fromisoformat(a["released"]),
                    label=a.get("label"),
                    tracks=a["tracks"],
                    seconds=a["seconds"],
                    genre=a["genre"],
                    upc=a.get("upc"),
                    note=a.get("note", ""),
                )
                .returning(albums.c.id)
            )
            for position, artist in enumerate(a["artistIds"]):
                await session.execute(
                    insert(album_artists).values(
                        album_id=album_ids[key],
                        artist_id=artist_ids[artist],
                        position=position,
                    )
                )
            for link in a["links"]:
                await session.execute(
                    insert(service_links).values(
                        workspace_id=workspace,
                        album_id=album_ids[key],
                        service=link["service"],
                        ref=link["ref"],
                        matched_by=link["matchedBy"],
                    )
                )
        for w in seed["weeks"]:
            starts = date.fromisoformat(w["startsOn"])
            sent = w.get("sent")
            week = await session.scalar(
                insert(weeks)
                .values(
                    workspace_id=workspace,
                    uuid=stable("week", w["id"]),
                    starts_on=starts,
                    closed_at=datetime(
                        starts.year, starts.month, starts.day, tzinfo=UTC
                    )
                    if w["closed"]
                    else None,
                    sent={
                        "at": sent["at"] + "+00:00",
                        "service": "spotify",
                        "playlist_ref": sent["playlistRef"],
                        "album_ids": [
                            str(stable("album", i)) for i in sent["albumIds"]
                        ],
                        "tracks": sum(
                            seed["albums"][i]["tracks"] for i in sent["albumIds"]
                        ),
                        "left_out": 0,
                    }
                    if sent
                    else None,
                )
                .returning(weeks.c.id)
            )
            for position, e in enumerate(w["entries"]):
                await session.execute(
                    insert(log_entries).values(
                        week_id=week,
                        album_id=album_ids[e["albumId"]],
                        position=position,
                        lane=e["lane"],
                        reason=e["reason"],
                        verdict=e.get("verdict"),
                        note=e.get("note", ""),
                    )
                )
        sig = seed["signals"]

        def albums_of(counts, scale):
            return {
                str(stable("album", k)): max(1, round(v / scale))
                for k, v in counts.items()
            }

        synced = datetime.fromisoformat(sig["syncedAt"]).replace(tzinfo=UTC)
        await session.execute(
            insert(signals).values(
                workspace_id=workspace,
                synced_at=synced,
                data={
                    "followed_artist_ids": [
                        str(stable("artist", a)) for a in sig["followedArtistIds"]
                    ],
                    "top_artist_ids": [
                        str(stable("artist", a)) for a in sig["topArtistIds"]
                    ],
                    # Lifetime plays become top tracks: 20 plays is about one.
                    "top_tracks": albums_of(sig["lifetimePlays"], 15),
                    "recent_tracks": albums_of(sig["recentPlays"], 1),
                },
            )
        )
        data = await repo.load(session, workspace)
        await conn.rollback()
    await engine.dispose()
    result = view(data, Policy())
    result["spotify"] = {
        "state": "connected",
        "client_id": "0123456789abcdef0123456789abcdef",
        "error": None,
        "account_name": "Synthetic Listener",
        "connected_at": "2026-11-02T09:00:00+00:00",
        "synced_at": synced.isoformat(),
    }
    return result


if __name__ == "__main__":
    url = os.environ["PALINSESTO_TEST_DATABASE_URL"]
    print(json.dumps(asyncio.run(build(json.load(sys.stdin), url)), indent=1))
