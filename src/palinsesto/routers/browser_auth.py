"""Browser sign-in, metadata and logout with no provider tokens in responses."""

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

from palinsesto.routers.authentication import SESSION_COOKIE, Session, Token
from palinsesto.services.access import RejectionError, revoke_session
from palinsesto.services.browser_auth import (
    account_metadata,
    admit_identity,
    begin_login,
    consume_login,
    csrf_token,
)

router = APIRouter(prefix="/api/auth", tags=["browser authentication"])
LOGIN_COOKIE = "palinsesto_login"


def no_store(response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


def set_cookie(response, name, value, max_age):
    response.set_cookie(
        name,
        value,
        max_age=max_age,
        secure=True,
        httponly=True,
        samesite="lax",
        path="/",
    )


@router.get("/login")
async def login(request: Request, session: Session):
    provider = request.app.state.oidc_provider
    provider.configured()
    state, binding, nonce, verifier = await begin_login(session)
    try:
        url = await provider.authorization_url(state, nonce, verifier)
    except Exception:
        raise RejectionError(
            "sign_in_unavailable", "Sign-in provider is unavailable. Try again.", 503
        ) from None
    response = no_store(RedirectResponse(url, status_code=302))
    set_cookie(response, LOGIN_COOKIE, binding, 600)
    return response


@router.get("/callback")
async def callback(request: Request, session: Session):
    # Do not expose authorization codes/state through server access-log query strings.
    query = request.query_params
    request.scope["query_string"] = b""
    state, code = query.get("state"), query.get("code")
    binding = request.cookies.get(LOGIN_COOKIE)
    if not state or not binding:
        raise RejectionError(
            "invalid_login", "Sign-in expired or is invalid. Start again.", 401
        )
    transaction = await consume_login(session, state, binding)
    if not code or query.get("error"):
        raise RejectionError(
            "invalid_login", "Sign-in was not completed. Start again.", 401
        )
    try:
        claims = await request.app.state.oidc_provider.identity(
            code, transaction["nonce"], transaction["verifier"]
        )
    except Exception:
        raise RejectionError(
            "invalid_identity", "Sign-in could not be verified. Start again.", 401
        ) from None
    issued = await admit_identity(session, claims, request.app.state.auth_settings)
    response = no_store(RedirectResponse("/", status_code=303))
    set_cookie(response, SESSION_COOKIE, issued["token"], 12 * 60 * 60)
    response.delete_cookie(
        LOGIN_COOKIE, secure=True, httponly=True, samesite="lax", path="/"
    )
    return response


@router.get("/session")
async def current_session(request: Request, session: Session, token: Token):
    result = await account_metadata(session, token)
    result["csrf_token"] = csrf_token(
        request.cookies[SESSION_COOKIE], request.app.state.auth_settings
    )
    return no_store(JSONResponse(result))


@router.post("/logout")
async def logout(session: Session, token: Token):
    await revoke_session(session, token)
    response = no_store(JSONResponse({"signed_out": True}))
    response.delete_cookie(
        SESSION_COOKIE, secure=True, httponly=True, samesite="lax", path="/"
    )
    return response
