"""Spotify adapter: the OAuth token calls and the few Web API endpoints Palinsesto uses.

Bring your own app: every call takes the Workspace owner's own client ID and
secret. Development-mode limits since February 2026 shape this module: search
returns at most 10 albums, there are no batch album or artist reads, playlists
are created with POST /me/playlists and filled through /playlists/{id}/items,
and album objects no longer carry a label.

Errors carry only safe codes (see ERRORS). Never log tokens, secrets or
provider error text.
"""

import base64
import hashlib
import secrets
import time
from dataclasses import dataclass
from datetime import date
from urllib.parse import urlencode, urlsplit

import httpx
import structlog

log = structlog.get_logger(__name__)

SCOPES = (
    "user-follow-read",
    "user-top-read",
    "user-read-recently-played",
    "playlist-modify-private",
)
SEARCH_LIMIT = 10
PLAYLIST_BATCH = 100

# Every way a Spotify call can fail, with what the owner should do about it.
# The setup guide in Settings shows the same codes.
ERRORS = {
    "invalid_client": "Spotify rejected the client ID or secret. Copy both again "
    "from your app's Settings page in the Spotify dashboard.",
    "redirect_mismatch": "Spotify did not accept the redirect URI. Paste the exact "
    "redirect URI shown here into your app's Redirect URIs and save.",
    "access_denied": "Spotify sign-in was cancelled. Click Connect Spotify to try "
    "again.",
    "not_allowlisted": "Spotify refused this account (403). Add the Spotify account "
    "you sign in with under User Management in your app, then connect again.",
    "premium_required": "Spotify refused the app because its owner has no active "
    "Premium subscription. Renew Premium on the account that owns the app.",
    "token_revoked": "Spotify access was revoked or expired (refresh tokens last "
    "six months). Click Connect Spotify to sign in again.",
    "rate_limited": "Spotify's request limit was reached. Try again in a few minutes.",
    "unavailable": "Spotify could not be reached. Nothing changed.",
}


class SpotifyError(Exception):
    """A failed Spotify call. Carries only a safe code and HTTP status."""

    def __init__(self, code: str, status: int | None = None):
        self.code, self.status = code, status
        super().__init__(ERRORS[code])


def redirect_problem(uri: str) -> str | None:
    """Why Spotify would refuse this redirect URI, or None if it is acceptable."""
    url = urlsplit(uri)
    if url.scheme == "https" and url.hostname:
        return None
    if url.scheme == "http" and url.hostname in {"127.0.0.1", "::1"}:
        return None if url.port else "loopback_without_port"
    if url.scheme == "http" and url.hostname == "localhost":
        return "localhost"
    return "not_https"


def pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    challenge = (
        base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
        .rstrip(b"=")
        .decode()
    )
    return verifier, challenge


@dataclass(frozen=True)
class Tokens:
    access_token: str
    refresh_token: str | None
    scope: str


@dataclass(frozen=True)
class RemoteAlbum:
    """A Spotify album mapped to the fields the catalog keeps."""

    ref: str
    title: str
    artists: tuple[tuple[str, str], ...]  # (artist ref, name)
    released: date
    tracks: int
    seconds: int | None  # None from search results; album reads total the tracks
    upc: str | None
    image_url: str | None


def released_on(value: str, precision: str) -> date:
    """Spotify release dates can be a year or a month; take the first day."""
    if precision == "year":
        return date(int(value[:4]), 1, 1)
    if precision == "month":
        return date(int(value[:4]), int(value[5:7]), 1)
    return date.fromisoformat(value)


def remote_album(data: dict, seconds: int | None = None) -> RemoteAlbum:
    images = data.get("images") or []
    return RemoteAlbum(
        ref=data["uri"],
        title=data["name"],
        artists=tuple((a["uri"], a["name"]) for a in data["artists"]),
        released=released_on(
            data["release_date"], data.get("release_date_precision", "day")
        ),
        tracks=data["total_tracks"],
        seconds=seconds,
        upc=(data.get("external_ids") or {}).get("upc"),
        image_url=images[0]["url"] if images else None,
    )


def spotify_id(ref: str) -> str:
    """The bare ID from a URI such as spotify:album:4aawyAB9vmqN3uQ7FjRGTy."""
    return ref.rsplit(":", 1)[-1]


class SpotifyAccounts:
    """accounts.spotify.com: authorize URLs and the token endpoint."""

    def __init__(
        self,
        client_id: str,
        client_secret: str,
        *,
        base_url: str = "https://accounts.spotify.com",
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self.client_id, self._secret = client_id, client_secret
        self._base = base_url.rstrip("/")
        self._transport = transport

    def authorize_url(self, redirect_uri: str, state: str, challenge: str) -> str:
        query = urlencode(
            {
                "client_id": self.client_id,
                "response_type": "code",
                "redirect_uri": redirect_uri,
                "state": state,
                "scope": " ".join(SCOPES),
                "code_challenge_method": "S256",
                "code_challenge": challenge,
            }
        )
        return f"{self._base}/authorize?{query}"

    async def _token(self, operation: str, form: dict) -> Tokens:
        basic = base64.b64encode(f"{self.client_id}:{self._secret}".encode()).decode()
        try:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=20, follow_redirects=False
            ) as client:
                response = await client.post(
                    self._base + "/api/token",
                    data=form,
                    headers={"Authorization": f"Basic {basic}"},
                )
        except httpx.HTTPError:
            log.warning("spotify_token_failed", operation=operation, error="transport")
            raise SpotifyError("unavailable") from None
        log.info("spotify_token", operation=operation, status=response.status_code)
        if response.status_code == 200:
            data = response.json()
            return Tokens(
                data["access_token"], data.get("refresh_token"), data.get("scope", "")
            )
        try:
            body = response.json()
        except ValueError:
            body = {}
        error = body.get("error")
        description = str(body.get("error_description", "")).lower()
        if error == "invalid_client":
            raise SpotifyError("invalid_client", response.status_code)
        if error == "invalid_grant" and "redirect" in description:
            raise SpotifyError("redirect_mismatch", response.status_code)
        if error == "invalid_grant":
            raise SpotifyError("token_revoked", response.status_code)
        if response.status_code == 429:
            raise SpotifyError("rate_limited", 429)
        raise SpotifyError("unavailable", response.status_code)

    async def verify(self) -> None:
        """Check the client ID and secret pair without involving a user."""
        await self._token("verify", {"grant_type": "client_credentials"})

    async def exchange(self, code: str, redirect_uri: str, verifier: str) -> Tokens:
        return await self._token(
            "exchange",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": self.client_id,
                "code_verifier": verifier,
            },
        )

    async def refresh(self, refresh_token: str) -> Tokens:
        return await self._token(
            "refresh",
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": self.client_id,
            },
        )


class SpotifyApi:
    """api.spotify.com/v1 with one user's access token."""

    def __init__(
        self,
        access_token: str,
        *,
        base_url: str = "https://api.spotify.com/v1",
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._token = access_token
        self._base = base_url.rstrip("/")
        self._transport = transport

    async def _call(self, method: str, operation: str, path: str, **kwargs):
        started = time.monotonic()
        url = path if path.startswith("http") else self._base + path
        try:
            async with httpx.AsyncClient(
                transport=self._transport, timeout=20, follow_redirects=False
            ) as client:
                response = await client.request(
                    method,
                    url,
                    headers={"Authorization": f"Bearer {self._token}"},
                    **kwargs,
                )
        except httpx.HTTPError:
            log.warning(
                "spotify_request_failed", operation=operation, error="transport"
            )
            raise SpotifyError("unavailable") from None
        log.info(
            "spotify_request",
            operation=operation,
            status=response.status_code,
            ms=round((time.monotonic() - started) * 1000),
        )
        if response.status_code in (200, 201):
            try:
                return response.json()
            except ValueError:
                raise SpotifyError("unavailable", response.status_code) from None
        if response.status_code == 401:
            raise SpotifyError("token_revoked", 401)
        if response.status_code == 403:
            try:
                message = str(response.json()["error"]["message"]).lower()
            except (ValueError, KeyError, TypeError):
                message = ""
            raise SpotifyError(
                "premium_required" if "premium" in message else "not_allowlisted", 403
            )
        if response.status_code == 429:
            raise SpotifyError("rate_limited", 429)
        raise SpotifyError("unavailable", response.status_code)

    async def _get(self, operation: str, path: str, params: dict | None = None):
        return await self._call("GET", operation, path, params=params)

    async def me(self) -> dict:
        data = await self._get("me", "/me")
        return {"id": data["id"], "name": data.get("display_name") or data["id"]}

    async def followed_artists(self) -> list[tuple[str, str]]:
        found, after = [], None
        for _ in range(10):
            params = {"type": "artist", "limit": 50}
            if after:
                params["after"] = after
            page = (await self._get("followed_artists", "/me/following", params))[
                "artists"
            ]
            found += [(a["uri"], a["name"]) for a in page["items"]]
            after = (page.get("cursors") or {}).get("after")
            if not after:
                break
        return found

    async def top_artists(self) -> list[tuple[str, str]]:
        params = {"time_range": "medium_term", "limit": 50}
        data = await self._get("top_artists", "/me/top/artists", params)
        return [(a["uri"], a["name"]) for a in data["items"]]

    async def top_track_albums(self) -> list[dict]:
        """The album of each long-term top track (one entry per track)."""
        params = {"time_range": "long_term", "limit": 50}
        data = await self._get("top_tracks", "/me/top/tracks", params)
        return [t["album"] for t in data["items"]]

    async def recent_track_albums(self) -> list[dict]:
        """The album of each recently played track: Spotify keeps only 50."""
        data = await self._get(
            "recently_played", "/me/player/recently-played", {"limit": 50}
        )
        return [i["track"]["album"] for i in data["items"]]

    async def artist_albums(self, artist_ref: str) -> list[dict]:
        """An artist's albums, newest first as Spotify returns them."""
        path = f"/artists/{spotify_id(artist_ref)}/albums"
        params = {"include_groups": "album", "limit": 10}
        return (await self._get("artist_albums", path, params))["items"]

    async def album(self, ref: str) -> RemoteAlbum:
        """One album with its total length; there is no batch read any more."""
        data = await self._get("album", f"/albums/{spotify_id(ref)}")
        tracks = data["tracks"]
        ms = sum(t["duration_ms"] for t in tracks["items"])
        following = tracks.get("next")
        while following:
            page = await self._get("album_tracks", following)
            ms += sum(t["duration_ms"] for t in page["items"])
            following = page.get("next")
        return remote_album(data, round(ms / 1000))

    async def album_track_refs(self, ref: str) -> list[str]:
        path = f"/albums/{spotify_id(ref)}/tracks"
        page = await self._get("album_tracks", path, {"limit": 50})
        refs = [t["uri"] for t in page["items"]]
        while page.get("next"):
            page = await self._get("album_tracks", page["next"])
            refs += [t["uri"] for t in page["items"]]
        return refs

    async def search_albums(self, query: str) -> list[RemoteAlbum]:
        params = {"q": query, "type": "album", "limit": SEARCH_LIMIT}
        data = await self._get("search", "/search", params)
        return [remote_album(a) for a in data["albums"]["items"]]

    async def create_playlist(self, name: str, description: str) -> str:
        body = {"name": name, "description": description, "public": False}
        data = await self._call("POST", "create_playlist", "/me/playlists", json=body)
        return data["uri"]

    async def replace_playlist(self, playlist_ref: str, track_refs: list[str]) -> None:
        """Replace a playlist's items, 100 at a time, keeping their order."""
        path = f"/playlists/{spotify_id(playlist_ref)}/items"
        first, rest = track_refs[:PLAYLIST_BATCH], track_refs[PLAYLIST_BATCH:]
        await self._call("PUT", "replace_items", path, json={"uris": first})
        for start in range(0, len(rest), PLAYLIST_BATCH):
            chunk = rest[start : start + PLAYLIST_BATCH]
            await self._call("POST", "add_items", path, json={"uris": chunk})
