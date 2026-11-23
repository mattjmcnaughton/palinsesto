"""The desk: the catalog, weeks, log entries, verdicts and policy of one Workspace.

Every write locks the Workspace row, applies one change, and returns the whole
desk again, so the browser never reconciles partial state.
"""

from dataclasses import asdict, fields
from datetime import UTC, date, datetime
from uuid import UUID

from sqlalchemy import delete, func, insert, select, update

from palinsesto.domains import rotation as r
from palinsesto.models.accounts import workspaces
from palinsesto.models.catalog import albums, service_links
from palinsesto.models.weeks import log_entries, weeks
from palinsesto.repositories import desk as repo
from palinsesto.services.access import (
    AuthenticatedActor,
    RejectionError,
    owned_workspace,
)


def policy_of(stored: dict) -> r.Policy:
    known = {f.name for f in fields(r.Policy)}
    return r.Policy(**{k: v for k, v in stored.items() if k in known})


def domain(data: dict, policy: r.Policy) -> r.Desk:
    sig = data["signals"] or {}
    return r.Desk(
        artists={k: v["name"] for k, v in data["artists"].items()},
        albums={
            k: r.Album(
                k,
                a["title"],
                tuple(a["artist_ids"]),
                date.fromisoformat(a["released"]),
                a["seconds"],
                a["genre"],
            )
            for k, a in data["albums"].items()
        },
        weeks=tuple(
            r.Week(
                w["id"],
                date.fromisoformat(w["starts_on"]),
                tuple(
                    r.Entry(e["album_id"], e["lane"], e["reason"], e["verdict"])
                    for e in w["entries"]
                ),
                w["closed"],
            )
            for w in data["weeks"]
        ),
        policy=policy,
        signals=r.Signals(
            frozenset(sig.get("followed_artist_ids", [])),
            frozenset(sig.get("top_artist_ids", [])),
            dict(sig.get("top_tracks", {})),
            dict(sig.get("recent_tracks", {})),
        ),
    )


async def ensure_open_week(session, workspace) -> None:
    """A Workspace always has one week on the desk, starting this Monday at first."""
    if await repo.open_week(session, workspace["id"]):
        return
    monday = repo.monday_of(repo.today_in(workspace["time_zone"], datetime.now(UTC)))
    last = await session.scalar(
        select(func.max(weeks.c.starts_on)).where(
            weeks.c.workspace_id == workspace["id"]
        )
    )
    starts = (
        monday if last is None else max(monday, date.fromordinal(last.toordinal() + 7))
    )
    await session.execute(
        insert(weeks).values(workspace_id=workspace["id"], starts_on=starts)
    )


def view(data: dict, policy: r.Policy) -> dict:
    """The desk as the browser reads it: records plus what the engine derives."""
    desk = domain(data, policy)
    current = desk.current
    connection = data.pop("connection")
    return {
        **data,
        "policy": asdict(policy),
        "current_week_id": current.id,
        "week_numbers": {w.id: w.number for w in desk.weeks},
        "candidates": [asdict(c) for c in r.candidates(desk)],
        "checks": [asdict(c) for c in r.checks(desk, current)],
        "spotify": public_connection(connection),
    }


def public_connection(row) -> dict:
    """Connection status for the browser. Secrets never leave the server."""
    if row is None:
        return {"state": "not_set_up"}
    return {
        "state": row["state"],
        "client_id": row["client_id"],
        "error": row["error"],
        "account_name": row["account_name"],
        "connected_at": row["connected_at"] and row["connected_at"].isoformat(),
        "synced_at": row["synced_at"] and row["synced_at"].isoformat(),
    }


async def read(session, actor: AuthenticatedActor, workspace_uuid: UUID) -> dict:
    async with session.begin():
        workspace = await owned_workspace(session, actor, workspace_uuid, lock=True)
        await ensure_open_week(session, workspace)
        data = await repo.load(session, workspace["id"])
    return view(data, policy_of(workspace["policy"]))


async def write(session, actor, workspace_uuid, change) -> dict:
    """Run one change under the Workspace lock, then return the new desk."""
    async with session.begin():
        workspace = await owned_workspace(session, actor, workspace_uuid, lock=True)
        await ensure_open_week(session, workspace)
        await change(session, workspace)
        workspace = await owned_workspace(session, actor, workspace_uuid)
        data = await repo.load(session, workspace["id"])
    return view(data, policy_of(workspace["policy"]))


def not_found(what: str):
    return RejectionError(f"{what}_not_found", f"No such {what}.", 404)


async def album_or_404(session, workspace_id, album_uuid) -> int:
    found = await repo.album_id(session, workspace_id, album_uuid)
    if found is None:
        raise not_found("album")
    return found


async def week_or_404(session, workspace_id, week_uuid):
    row = (
        (
            await session.execute(
                select(weeks).where(
                    weeks.c.workspace_id == workspace_id, weeks.c.uuid == week_uuid
                )
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise not_found("week")
    return row


async def entries_of(session, week_id):
    return await repo.rows(
        session,
        select(log_entries)
        .where(log_entries.c.week_id == week_id)
        .order_by(log_entries.c.position),
    )


async def renumber(session, ordered_ids: list[int]) -> None:
    for position, entry_id in enumerate(ordered_ids):
        await session.execute(
            update(log_entries)
            .where(log_entries.c.id == entry_id)
            .values(position=position)
        )


# Changes. Each takes (session, workspace) once bound to its arguments.


def add_entry(album_uuid: UUID):
    """Add an album to the open week; its lane and reason come from the engine."""

    async def change(session, workspace):
        album = await album_or_404(session, workspace["id"], album_uuid)
        week = await repo.open_week(session, workspace["id"])
        existing = await entries_of(session, week["id"])
        if any(e["album_id"] == album for e in existing):
            return
        desk = domain(
            await repo.load(session, workspace["id"]), policy_of(workspace["policy"])
        )
        entry = r.entry_for(desk, str(album_uuid))
        await session.execute(
            insert(log_entries).values(
                week_id=week["id"],
                album_id=album,
                position=len(existing),
                lane=entry.lane,
                reason=entry.reason,
            )
        )
        await session.execute(
            update(weeks)
            .where(weeks.c.id == week["id"])
            .values(skipped=[s for s in week["skipped"] if s != album_uuid])
        )

    return change


def remove_entry(album_uuid: UUID):
    async def change(session, workspace):
        album = await album_or_404(session, workspace["id"], album_uuid)
        week = await repo.open_week(session, workspace["id"])
        await session.execute(
            delete(log_entries).where(
                log_entries.c.week_id == week["id"], log_entries.c.album_id == album
            )
        )
        await renumber(
            session, [e["id"] for e in await entries_of(session, week["id"])]
        )

    return change


def move_entry(album_uuid: UUID, to: int):
    async def change(session, workspace):
        album = await album_or_404(session, workspace["id"], album_uuid)
        week = await repo.open_week(session, workspace["id"])
        ids = [(e["id"], e["album_id"]) for e in await entries_of(session, week["id"])]
        moving = next((i for i, a in ids if a == album), None)
        if moving is None:
            raise not_found("entry")
        rest = [i for i, _ in ids if i != moving]
        rest.insert(max(0, min(len(rest), to)), moving)
        await renumber(session, rest)

    return change


def skip(album_uuid: UUID | None):
    """Skip an album for this week, or bring every skipped album back (None)."""

    async def change(session, workspace):
        week = await repo.open_week(session, workspace["id"])
        if album_uuid is None:
            skipped = []
        else:
            await album_or_404(session, workspace["id"], album_uuid)
            skipped = list(dict.fromkeys([*week["skipped"], album_uuid]))
        await session.execute(
            update(weeks).where(weeks.c.id == week["id"]).values(skipped=skipped)
        )

    return change


def mark_entry(week_uuid: UUID, album_uuid: UUID, values: dict):
    """Set a verdict or note on a log entry in any week."""

    async def change(session, workspace):
        week = await week_or_404(session, workspace["id"], week_uuid)
        album = await album_or_404(session, workspace["id"], album_uuid)
        if "verdict" in values and week["closed_at"] is None:
            raise RejectionError(
                "week_open", "Verdicts go on closed weeks in the log book.", 409
            )
        result = await session.execute(
            update(log_entries)
            .where(log_entries.c.week_id == week["id"], log_entries.c.album_id == album)
            .values(**values)
        )
        if not result.rowcount:
            raise not_found("entry")

    return change


def close_week():
    """Move the open week to the log book and put the next one on the desk."""

    async def change(session, workspace):
        week = await repo.open_week(session, workspace["id"])
        if not await entries_of(session, week["id"]):
            raise RejectionError("week_empty", "Add an album before closing.", 409)
        await session.execute(
            update(weeks)
            .where(weeks.c.id == week["id"])
            .values(closed_at=datetime.now(UTC))
        )
        monday = repo.monday_of(
            repo.today_in(workspace["time_zone"], datetime.now(UTC))
        )
        starts = r.next_week_start(r.Week("", week["starts_on"], (), True), monday)
        await session.execute(
            insert(weeks).values(workspace_id=workspace["id"], starts_on=starts)
        )

    return change


def album_note(album_uuid: UUID, note: str):
    async def change(session, workspace):
        album = await album_or_404(session, workspace["id"], album_uuid)
        await session.execute(
            update(albums).where(albums.c.id == album).values(note=note)
        )

    return change


def album_genre(album_uuid: UUID, genre: str):
    async def change(session, workspace):
        album = await album_or_404(session, workspace["id"], album_uuid)
        await session.execute(
            update(albums).where(albums.c.id == album).values(genre=genre)
        )

    return change


def unlink(album_uuid: UUID, service: str):
    async def change(session, workspace):
        album = await album_or_404(session, workspace["id"], album_uuid)
        await session.execute(
            delete(service_links).where(
                service_links.c.album_id == album, service_links.c.service == service
            )
        )

    return change


def set_policy(policy: r.Policy):
    async def change(session, workspace):
        if policy.min_hours >= policy.max_hours:
            raise RejectionError(
                "invalid_policy", "The minimum must be shorter than the maximum.", 422
            )
        await session.execute(
            update(workspaces)
            .where(workspaces.c.id == workspace["id"])
            .values(policy=asdict(policy))
        )

    return change


def record_sent(sent: dict):
    async def change(session, workspace):
        week = await repo.open_week(session, workspace["id"])
        await session.execute(
            update(weeks).where(weeks.c.id == week["id"]).values(sent=sent)
        )

    return change
