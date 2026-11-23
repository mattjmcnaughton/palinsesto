"""Same-origin credential and CSRF boundary for HTTP adapters."""

import hmac
from typing import Annotated

from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from palinsesto.db import get_session
from palinsesto.services.access import AuthenticatedActor, RejectionError, resolve_actor
from palinsesto.services.browser_auth import csrf_token

SESSION_COOKIE = "palinsesto_session"
Session = Annotated[AsyncSession, Depends(get_session)]


async def credential(request: Request, session: Session) -> AuthenticatedActor:
    # A Bearer API key is the planned second credential kind (see access.py).
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise RejectionError("invalid_credential", "Sign in to continue.", 401)
    config = request.app.state.auth_settings
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        expected = csrf_token(token, config)
        if request.headers.get("origin") != config.browser_origin.rstrip(
            "/"
        ) or not hmac.compare_digest(
            request.headers.get("x-csrf-token", "").encode(), expected.encode()
        ):
            raise RejectionError(
                "csrf_rejected", "Refresh your session before trying again.", 403
            )
    async with session.begin():
        return await resolve_actor(session, token)


Token = Annotated[AuthenticatedActor, Depends(credential)]
