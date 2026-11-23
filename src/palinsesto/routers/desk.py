"""The desk API: one Workspace's catalog, weeks, log entries, verdicts and policy.

Every write returns the whole desk, the same shape GET returns.
"""

from uuid import UUID

from fastapi import APIRouter

from palinsesto.domains.rotation import Policy
from palinsesto.dtos.desk import (
    AlbumInput,
    AlbumRef,
    EntryInput,
    MoveInput,
    PolicyInput,
    SkipInput,
)
from palinsesto.routers.authentication import Session, Token
from palinsesto.services import desk

router = APIRouter(prefix="/api/workspaces/{workspace_id}", tags=["desk"])


@router.get("/desk")
async def read_desk(workspace_id: UUID, session: Session, token: Token):
    return await desk.read(session, token, workspace_id)


@router.post("/log/entries")
async def add(workspace_id: UUID, body: AlbumRef, session: Session, token: Token):
    return await desk.write(session, token, workspace_id, desk.add_entry(body.album_id))


@router.delete("/log/entries/{album_id}")
async def remove(workspace_id: UUID, album_id: UUID, session: Session, token: Token):
    return await desk.write(session, token, workspace_id, desk.remove_entry(album_id))


@router.post("/log/move")
async def move(workspace_id: UUID, body: MoveInput, session: Session, token: Token):
    change = desk.move_entry(body.album_id, body.to)
    return await desk.write(session, token, workspace_id, change)


@router.post("/log/skip")
async def skip(workspace_id: UUID, body: SkipInput, session: Session, token: Token):
    return await desk.write(session, token, workspace_id, desk.skip(body.album_id))


@router.post("/log/close")
async def close(workspace_id: UUID, session: Session, token: Token):
    return await desk.write(session, token, workspace_id, desk.close_week())


@router.patch("/weeks/{week_id}/entries/{album_id}")
async def mark(
    workspace_id: UUID,
    week_id: UUID,
    album_id: UUID,
    body: EntryInput,
    session: Session,
    token: Token,
):
    values: dict = {}
    if body.clear_verdict:
        values["verdict"] = None
    elif body.verdict:
        values["verdict"] = body.verdict
    if body.note is not None:
        values["note"] = body.note
    change = desk.mark_entry(week_id, album_id, values)
    return await desk.write(session, token, workspace_id, change)


@router.patch("/albums/{album_id}")
async def edit_album(
    workspace_id: UUID, album_id: UUID, body: AlbumInput, session: Session, token: Token
):
    result = None
    if body.note is not None:
        result = await desk.write(
            session, token, workspace_id, desk.album_note(album_id, body.note)
        )
    if body.genre is not None:
        result = await desk.write(
            session, token, workspace_id, desk.album_genre(album_id, body.genre)
        )
    return result or await desk.read(session, token, workspace_id)


@router.delete("/albums/{album_id}/links/{service}")
async def unlink(
    workspace_id: UUID, album_id: UUID, service: str, session: Session, token: Token
):
    return await desk.write(
        session, token, workspace_id, desk.unlink(album_id, service)
    )


@router.put("/policy")
async def policy(workspace_id: UUID, body: PolicyInput, session: Session, token: Token):
    change = desk.set_policy(Policy(**body.model_dump()))
    return await desk.write(session, token, workspace_id, change)
