"""The Workspace's Spotify connection: setup, Connect, sync, search, import, send.

No response here ever contains the client secret or a token.
"""

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from palinsesto.db import async_session
from palinsesto.domains.rotation import short_date, week_number
from palinsesto.dtos.desk import CredentialsInput, ImportInput, SearchInput
from palinsesto.routers.authentication import Session, Token
from palinsesto.routers.browser_auth import no_store, set_cookie
from palinsesto.services import desk
from palinsesto.services.spotify import Endpoints, SpotifyConnection

router = APIRouter(tags=["spotify"])
prefix = "/api/workspaces/{workspace_id}/spotify"
CONNECT_COOKIE = "palinsesto_spotify"


def connection(request: Request) -> SpotifyConnection:
    config = request.app.state.auth_settings
    return SpotifyConnection(
        getattr(request.app.state, "sessions", async_session),
        config,
        Endpoints(
            config.spotify_accounts_url,
            config.spotify_api_url,
            getattr(request.app.state, "spotify_transport", None),
        ),
    )


@router.get(prefix + "/setup")
async def setup(workspace_id: UUID, request: Request, session: Session, token: Token):
    """The redirect URI to paste into the Spotify app, and whether Spotify takes it."""
    async with session.begin():
        await desk.owned_workspace(session, token, workspace_id)
    return connection(request).setup()


@router.put(prefix + "/credentials")
async def credentials(
    workspace_id: UUID,
    body: CredentialsInput,
    request: Request,
    session: Session,
    token: Token,
):
    await connection(request).save_credentials(
        token, workspace_id, body.client_id, body.client_secret
    )
    return await desk.read(session, token, workspace_id)


@router.delete(prefix)
async def disconnect(
    workspace_id: UUID, request: Request, session: Session, token: Token
):
    await connection(request).disconnect(token, workspace_id)
    return await desk.read(session, token, workspace_id)


@router.get(prefix + "/connect")
async def connect(workspace_id: UUID, request: Request, token: Token):
    url, binding = await connection(request).begin(token, workspace_id)
    response = no_store(RedirectResponse(url, status_code=302))
    set_cookie(response, CONNECT_COOKIE, binding, 600)
    return response


@router.get("/api/spotify/callback")
async def callback(request: Request, token: Token):
    # Keep the authorization code out of access logs.
    query = request.query_params
    request.scope["query_string"] = b""
    await connection(request).complete(
        token,
        query.get("state"),
        request.cookies.get(CONNECT_COOKIE),
        query.get("code"),
        query.get("error"),
    )
    response = no_store(RedirectResponse("/#/settings", status_code=303))
    response.delete_cookie(
        CONNECT_COOKIE, secure=True, httponly=True, samesite="lax", path="/"
    )
    return response


@router.post(prefix + "/sync")
async def sync(workspace_id: UUID, request: Request, session: Session, token: Token):
    result = await connection(request).sync(token, workspace_id)
    return {**result, "desk": await desk.read(session, token, workspace_id)}


@router.post(prefix + "/search")
async def search(workspace_id: UUID, body: SearchInput, request: Request, token: Token):
    return await connection(request).search(token, workspace_id, body.q)


@router.post(prefix + "/import")
async def import_album(
    workspace_id: UUID,
    body: ImportInput,
    request: Request,
    session: Session,
    token: Token,
):
    album = await connection(request).import_album(token, workspace_id, body.ref)
    if body.add:
        return await desk.write(session, token, workspace_id, desk.add_entry(album))
    return await desk.read(session, token, workspace_id)


@router.post(prefix + "/send")
async def send(workspace_id: UUID, request: Request, session: Session, token: Token):
    """Send the open week to a private playlist; album order is the log order."""
    current = await desk.read(session, token, workspace_id)
    week = next(w for w in current["weeks"] if w["id"] == current["current_week_id"])
    ids, refs = [], []
    for entry in week["entries"]:
        album = current["albums"][entry["album_id"]]
        link = next((x for x in album["links"] if x["service"] == "spotify"), None)
        if link:
            ids.append(entry["album_id"])
            refs.append(link["ref"])
    starts = datetime.fromisoformat(week["starts_on"]).date()
    name = f"Palinsesto, week {week_number(starts)} (from {short_date(starts)})"
    playlist, tracks = await connection(request).send(token, workspace_id, name, refs)
    sent = {
        "at": datetime.now(UTC).isoformat(),
        "service": "spotify",
        "playlist_ref": playlist,
        "album_ids": ids,
        "tracks": tracks,
        "left_out": len(week["entries"]) - len(ids),
    }
    return await desk.write(session, token, workspace_id, desk.record_sent(sent))
