"""Credential resolution and Workspace authorization shared by every adapter.

Browser sessions are the only credential today. API keys and MCP will be added
here as further credential kinds once Accanto has proven that design; every
service already takes an AuthenticatedActor rather than an HTTP request.
"""

import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from sqlalchemy import insert, select, update

from palinsesto.models.accounts import sessions, workspaces


class RejectionError(Exception):
    def __init__(self, code: str, message: str, status: int = 409):
        self.code, self.message, self.status = code, message, status
        super().__init__(message)


@dataclass(frozen=True)
class AuthenticatedActor:
    user_id: int
    credential_kind: Literal["session"]
    credential_uuid: UUID
    credential_digest: str = field(repr=False)


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def invalid_credential():
    return RejectionError(
        "invalid_credential", "Credential is invalid or expired.", 401
    )


async def resolve_actor(session, token: str, *, lock=False) -> AuthenticatedActor:
    """Resolve a browser session secret; the caller owns the transaction."""
    query = select(sessions).where(sessions.c.digest == digest(token))
    if lock:
        query = query.with_for_update()
    record = (await session.execute(query)).mappings().first()
    # Evaluate expiry after waiting for the lock, not before a concurrent logout.
    if (
        not record
        or record["revoked_at"] is not None
        or record["expires_at"] <= datetime.now(UTC)
    ):
        raise invalid_credential()
    return AuthenticatedActor(
        record["user_id"], "session", record["uuid"], record["digest"]
    )


async def revalidate_actor(session, actor: AuthenticatedActor, *, lock=False):
    query = select(sessions).where(sessions.c.uuid == actor.credential_uuid)
    if lock:
        query = query.with_for_update()
    record = (await session.execute(query)).mappings().first()
    if (
        not record
        or record["digest"] != actor.credential_digest
        or record["revoked_at"] is not None
        or record["expires_at"] <= datetime.now(UTC)
    ):
        raise invalid_credential()
    return actor


async def owned_workspace(
    session, actor: AuthenticatedActor, workspace_uuid: UUID, *, lock=False
):
    """The Workspace row, if the actor owns it. Caller owns the transaction.

    A Workspace has one owner. Someone else's Workspace answers 404, not 403,
    so its existence is not disclosed.
    """
    await revalidate_actor(session, actor)
    query = select(workspaces).where(
        workspaces.c.uuid == workspace_uuid,
        workspaces.c.owner_id == actor.user_id,
    )
    if lock:
        # Writes to one Workspace are serialized on its row.
        query = query.with_for_update()
    row = (await session.execute(query)).mappings().first()
    if row is None:
        raise RejectionError("workspace_not_found", "No such workspace.", 404)
    return row


async def issue_session(session, user_id: int):
    """Issue only after verified identity admission; caller owns the transaction."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(UTC) + timedelta(hours=12)
    reference = await session.scalar(
        insert(sessions)
        .values(user_id=user_id, digest=digest(token), expires_at=expires_at)
        .returning(sessions.c.uuid)
    )
    return {"id": str(reference), "token": token, "expires_at": expires_at}


async def revoke_session(session, actor: AuthenticatedActor):
    async with session.begin():
        await revalidate_actor(session, actor, lock=True)
        await session.execute(
            update(sessions)
            .where(sessions.c.uuid == actor.credential_uuid)
            .values(revoked_at=datetime.now(UTC))
        )
