"""Read a Workspace's catalog, weeks and signals; write catalog records."""

from datetime import date, datetime
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import func, insert, select

from palinsesto.models.catalog import album_artists, albums, artists, service_links
from palinsesto.models.connections import connections, signals
from palinsesto.models.weeks import log_entries, weeks


def today_in(time_zone: str, now: datetime) -> date:
    return now.astimezone(ZoneInfo(time_zone)).date()


def monday_of(day: date) -> date:
    return date.fromordinal(day.toordinal() - day.weekday())


async def rows(session, query):
    return (await session.execute(query)).mappings().all()


async def load(session, workspace_id: int) -> dict:
    """Every record the desk shows, keyed by public UUID strings."""
    links = await rows(
        session,
        select(service_links).where(service_links.c.workspace_id == workspace_id),
    )
    artist_rows = await rows(
        session, select(artists).where(artists.c.workspace_id == workspace_id)
    )
    artist_uuid = {r["id"]: str(r["uuid"]) for r in artist_rows}
    album_rows = await rows(
        session, select(albums).where(albums.c.workspace_id == workspace_id)
    )
    album_uuid = {r["id"]: str(r["uuid"]) for r in album_rows}
    credit_rows = await rows(
        session,
        select(album_artists)
        .join(albums, albums.c.id == album_artists.c.album_id)
        .where(albums.c.workspace_id == workspace_id)
        .order_by(album_artists.c.position),
    )

    def links_of(column, key):
        return [
            {"service": r["service"], "ref": r["ref"], "matched_by": r["matched_by"]}
            for r in links
            if r[column] == key
        ]

    credited: dict[int, list[str]] = {}
    for c in credit_rows:
        credited.setdefault(c["album_id"], []).append(artist_uuid[c["artist_id"]])

    week_rows = await rows(
        session,
        select(weeks)
        .where(weeks.c.workspace_id == workspace_id)
        .order_by(weeks.c.starts_on),
    )
    entry_rows = await rows(
        session,
        select(log_entries)
        .join(weeks, weeks.c.id == log_entries.c.week_id)
        .where(weeks.c.workspace_id == workspace_id)
        .order_by(log_entries.c.position),
    )
    signal = (
        (
            await session.execute(
                select(signals).where(signals.c.workspace_id == workspace_id)
            )
        )
        .mappings()
        .first()
    )
    connection = (
        (
            await session.execute(
                select(connections).where(
                    connections.c.workspace_id == workspace_id,
                    connections.c.service == "spotify",
                )
            )
        )
        .mappings()
        .first()
    )
    return {
        "artists": {
            artist_uuid[r["id"]]: {
                "id": artist_uuid[r["id"]],
                "name": r["name"],
                "links": links_of("artist_id", r["id"]),
            }
            for r in artist_rows
        },
        "albums": {
            album_uuid[r["id"]]: {
                "id": album_uuid[r["id"]],
                "title": r["title"],
                "artist_ids": credited.get(r["id"], []),
                "released": r["released"].isoformat(),
                "label": r["label"],
                "tracks": r["tracks"],
                "seconds": r["seconds"],
                "genre": r["genre"],
                "upc": r["upc"],
                "image_url": r["image_url"],
                "note": r["note"],
                "links": links_of("album_id", r["id"]),
            }
            for r in album_rows
        },
        "weeks": [
            {
                "id": str(w["uuid"]),
                "starts_on": w["starts_on"].isoformat(),
                "closed": w["closed_at"] is not None,
                "sent": w["sent"],
                "skipped": [str(s) for s in w["skipped"]],
                "entries": [
                    {
                        "album_id": album_uuid[e["album_id"]],
                        "lane": e["lane"],
                        "reason": e["reason"],
                        "verdict": e["verdict"],
                        "note": e["note"],
                    }
                    for e in entry_rows
                    if e["week_id"] == w["id"]
                ],
            }
            for w in week_rows
        ],
        "signals": (
            {"synced_at": signal["synced_at"].isoformat(), **signal["data"]}
            if signal
            else None
        ),
        "connection": connection,
    }


async def album_id(session, workspace_id: int, album_uuid: UUID) -> int | None:
    return await session.scalar(
        select(albums.c.id).where(
            albums.c.workspace_id == workspace_id, albums.c.uuid == album_uuid
        )
    )


async def open_week(session, workspace_id: int):
    return (
        (
            await session.execute(
                select(weeks).where(
                    weeks.c.workspace_id == workspace_id, weeks.c.closed_at.is_(None)
                )
            )
        )
        .mappings()
        .first()
    )


async def linked(session, workspace_id: int, service: str, ref: str):
    """The catalog record (album_id, artist_id) a service ref is linked to."""
    return (
        (
            await session.execute(
                select(service_links.c.album_id, service_links.c.artist_id).where(
                    service_links.c.workspace_id == workspace_id,
                    service_links.c.service == service,
                    service_links.c.ref == ref,
                )
            )
        )
        .mappings()
        .first()
    )


async def artist_for(session, workspace_id: int, ref: str, name: str) -> int:
    """The catalog artist for a Spotify artist, matched by link then name."""
    found = await linked(session, workspace_id, "spotify", ref)
    if found:
        return found["artist_id"]
    artist = await session.scalar(
        select(artists.c.id)
        .where(
            artists.c.workspace_id == workspace_id,
            func.lower(artists.c.name) == name.lower(),
        )
        .order_by(artists.c.id)
        .limit(1)
    )
    if artist is None:
        artist = await session.scalar(
            insert(artists)
            .values(workspace_id=workspace_id, name=name[:300])
            .returning(artists.c.id)
        )
    has_link = await session.scalar(
        select(service_links.c.id).where(
            service_links.c.artist_id == artist, service_links.c.service == "spotify"
        )
    )
    if not has_link:
        await session.execute(
            insert(service_links).values(
                workspace_id=workspace_id,
                artist_id=artist,
                service="spotify",
                ref=ref,
                matched_by="import",
            )
        )
    return artist
