"""Browser login lifecycle and current account metadata."""

import hashlib
import hmac
import secrets
from dataclasses import asdict
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, insert, select

from palinsesto.domains.rotation import Policy
from palinsesto.models.accounts import login_transactions, users, workspaces
from palinsesto.services.access import (
    RejectionError,
    digest,
    issue_session,
    revalidate_actor,
)

DEFAULT_TIME_ZONE = "America/New_York"


def csrf_token(token, config):
    return hmac.new(
        config.browser_csrf_secret.get_secret_value().encode(),
        token.encode(),
        hashlib.sha256,
    ).hexdigest()


async def begin_login(session):
    state, binding, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(4))
    async with session.begin():
        await session.execute(
            delete(login_transactions).where(
                login_transactions.c.expires_at <= datetime.now(UTC)
            )
        )
        await session.execute(
            insert(login_transactions).values(
                state_digest=digest(state),
                binding_digest=digest(binding),
                nonce=nonce,
                verifier=verifier,
                expires_at=datetime.now(UTC) + timedelta(minutes=10),
            )
        )
    return state, binding, nonce, verifier


async def consume_login(session, state, binding):
    async with session.begin():
        row = (
            (
                await session.execute(
                    delete(login_transactions)
                    .where(
                        login_transactions.c.state_digest == digest(state),
                        login_transactions.c.binding_digest == digest(binding),
                    )
                    .returning(login_transactions)
                )
            )
            .mappings()
            .first()
        )
    # Consumption commits even if provider or admission subsequently rejects.
    if not row or row["expires_at"] <= datetime.now(UTC):
        raise RejectionError(
            "invalid_login", "Sign-in expired or is invalid. Start again.", 401
        )
    return row


async def admit_identity(session, claims, config):
    """Admit a verified, allowlisted email; give a new identity its Workspace.

    Unlike Accanto, an admitted identity is provisioned on first sign-in: the
    email allowlist is the gate, and each User gets one Workspace they own.
    Identities are keyed by issuer and subject; matching email never links them.
    """
    if (
        claims.get("iss") != config.oidc_issuer
        or claims.get("email_verified") is not True
        or claims.get("email") not in config.oidc_allowed_emails
    ):
        raise RejectionError(
            "identity_not_admitted", "This identity is not admitted.", 403
        )
    async with session.begin():
        user = await session.scalar(
            select(users.c.id).where(
                users.c.issuer == config.oidc_issuer,
                users.c.subject == claims["sub"],
            )
        )
        if user is None:
            user = await provision(session, config.oidc_issuer, claims["sub"])
        return await issue_session(session, user)


async def provision(session, issuer, subject, *, name="My desk", time_zone=None):
    """A User and the Workspace they own. Caller owns the transaction."""
    user = await session.scalar(
        insert(users).values(issuer=issuer, subject=subject).returning(users.c.id)
    )
    await session.execute(
        insert(workspaces).values(
            owner_id=user,
            name=name,
            time_zone=time_zone or DEFAULT_TIME_ZONE,
            policy=asdict(Policy()),
        )
    )
    return user


async def account_metadata(session, actor):
    async with session.begin():
        await revalidate_actor(session, actor)
        user = await session.scalar(
            select(users.c.uuid).where(users.c.id == actor.user_id)
        )
        workspace = (
            (
                await session.execute(
                    select(workspaces).where(workspaces.c.owner_id == actor.user_id)
                )
            )
            .mappings()
            .one()
        )
        return {
            "user": {"id": str(user)},
            "workspace": {
                "id": str(workspace["uuid"]),
                "name": workspace["name"],
                "time_zone": workspace["time_zone"],
            },
        }
