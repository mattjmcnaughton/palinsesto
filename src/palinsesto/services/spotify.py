"""The Workspace's Spotify connection: credentials, Connect, sync, import and send.

Bring your own app. The owner's client secret and refresh token are encrypted
together with Fernet (CONNECTION_SECRET_KEY) and never returned to the browser.
A failed call stores its safe error code on the connection, so Settings can say
how to fix it.
"""

import json
import secrets
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from uuid import UUID

import httpx
from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import delete, insert, select, update

from palinsesto.domains.rotation import GOLD_TOP_TRACKS, Policy
from palinsesto.integrations.spotify import (
    ERRORS,
    RemoteAlbum,
    SpotifyAccounts,
    SpotifyApi,
    SpotifyError,
    pkce_pair,
    redirect_problem,
)
from palinsesto.models.accounts import workspaces
from palinsesto.models.catalog import album_artists, albums, artists, service_links
from palinsesto.models.connections import authorizations, connections, signals
from palinsesto.repositories import desk as repo
from palinsesto.services.access import RejectionError, digest, owned_workspace
from palinsesto.services.desk import policy_of

CALLBACK_PATH = "/api/spotify/callback"
# Errors that need the owner to act; the connection stays in error until they do.
BLOCKING = {"invalid_client", "not_allowlisted", "premium_required", "token_revoked"}
MAX_IMPORTS = 25
RECENT_TRACKS_FOR_FIRST_PLAY = 3


@dataclass
class Endpoints:
    accounts_url: str
    api_url: str
    transport: httpx.AsyncBaseTransport | None = None


def cipher(key) -> Fernet:
    value = key.get_secret_value() if hasattr(key, "get_secret_value") else key
    try:
        return Fernet(value.encode())
    except ValueError:
        raise RejectionError(
            "connections_unavailable",
            "An operator must set CONNECTION_SECRET_KEY before Spotify can connect.",
            503,
        ) from None


def seal(key, values: dict) -> str:
    return cipher(key).encrypt(json.dumps(values).encode()).decode()


def unseal(key, token: str) -> dict:
    try:
        return json.loads(cipher(key).decrypt(token.encode()))
    except InvalidToken:
        raise RejectionError(
            "secret_unreadable",
            "The stored Spotify secret cannot be decrypted. Enter it again.",
            409,
        ) from None


def redirect_uri(origin: str) -> str:
    return origin.rstrip("/") + CALLBACK_PATH


def rejection(error: SpotifyError) -> RejectionError:
    status = {"rate_limited": 429, "unavailable": 502}.get(error.code, 409)
    return RejectionError(f"spotify_{error.code}", ERRORS[error.code], status)


async def connection_of(session, workspace_id, *, lock=False):
    query = select(connections).where(
        connections.c.workspace_id == workspace_id, connections.c.service == "spotify"
    )
    if lock:
        query = query.with_for_update()
    return (await session.execute(query)).mappings().first()


async def require_connection(session, workspace_id, *, lock=False):
    row = await connection_of(session, workspace_id, lock=lock)
    if row is None:
        raise RejectionError(
            "spotify_not_set_up", "Set up Spotify in Settings first.", 409
        )
    return row


async def record_failure(sessions, workspace_id, error: SpotifyError) -> None:
    """Store a blocking error code in its own transaction, then let it raise."""
    if error.code not in BLOCKING:
        return
    async with sessions() as session, session.begin():
        await session.execute(
            update(connections)
            .where(
                connections.c.workspace_id == workspace_id,
                connections.c.service == "spotify",
            )
            .values(state="error", error=error.code)
        )


class SpotifyConnection:
    """One request's view of a Workspace's Spotify connection."""

    def __init__(self, sessions, settings, endpoints: Endpoints):
        self.sessions, self.settings, self.endpoints = sessions, settings, endpoints

    def accounts(self, client_id, client_secret) -> SpotifyAccounts:
        return SpotifyAccounts(
            client_id,
            client_secret,
            base_url=self.endpoints.accounts_url,
            transport=self.endpoints.transport,
        )

    def api(self, access_token) -> SpotifyApi:
        return SpotifyApi(
            access_token,
            base_url=self.endpoints.api_url,
            transport=self.endpoints.transport,
        )

    @property
    def redirect_uri(self) -> str:
        return redirect_uri(self.settings.browser_origin)

    def setup(self) -> dict:
        """What the setup guide shows: the exact redirect URI and whether it works."""
        uri = self.redirect_uri
        return {"redirect_uri": uri, "redirect_problem": redirect_problem(uri)}

    async def save_credentials(self, actor, workspace_uuid, client_id, client_secret):
        """Check the pair with Spotify, then store it. Clears any earlier token."""
        key = self.settings.connection_secret_key
        cipher(key)
        async with self.sessions() as session, session.begin():
            workspace = await owned_workspace(session, actor, workspace_uuid)
        try:
            await self.accounts(client_id, client_secret).verify()
        except SpotifyError as error:
            raise rejection(error) from None
        sealed = seal(key, {"client_secret": client_secret})
        async with self.sessions() as session, session.begin():
            await owned_workspace(session, actor, workspace_uuid, lock=True)
            await session.execute(
                delete(connections).where(
                    connections.c.workspace_id == workspace["id"],
                    connections.c.service == "spotify",
                )
            )
            await session.execute(
                insert(connections).values(
                    workspace_id=workspace["id"],
                    service="spotify",
                    client_id=client_id,
                    secret=sealed,
                    state="credentials",
                )
            )

    async def begin(self, actor, workspace_uuid) -> tuple[str, str]:
        """The Spotify authorize URL and a browser binding for the callback."""
        problem = redirect_problem(self.redirect_uri)
        if problem:
            raise RejectionError(
                "spotify_redirect_unusable",
                "Spotify only accepts an HTTPS redirect URI, or http://127.0.0.1 "
                "with a port. Open Palinsesto at such an address.",
                409,
            )
        state, binding = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        verifier, challenge = pkce_pair()
        async with self.sessions() as session, session.begin():
            workspace = await owned_workspace(session, actor, workspace_uuid)
            row = await require_connection(session, workspace["id"])
            await session.execute(
                delete(authorizations).where(
                    authorizations.c.expires_at <= datetime.now(UTC)
                )
            )
            await session.execute(
                insert(authorizations).values(
                    workspace_id=workspace["id"],
                    state_digest=digest(state),
                    binding_digest=digest(binding),
                    verifier=verifier,
                    expires_at=datetime.now(UTC) + timedelta(minutes=10),
                )
            )
        url = self.accounts(row["client_id"], "").authorize_url(
            self.redirect_uri, state, challenge
        )
        return url, binding

    async def complete(self, actor, state, binding, code, error) -> None:
        """Finish Connect. Failures are stored on the connection for Settings."""
        async with self.sessions() as session, session.begin():
            grant = (
                (
                    await session.execute(
                        delete(authorizations)
                        .where(
                            authorizations.c.state_digest == digest(state or ""),
                            authorizations.c.binding_digest == digest(binding or ""),
                        )
                        .returning(authorizations)
                    )
                )
                .mappings()
                .first()
            )
            if not grant or grant["expires_at"] <= datetime.now(UTC):
                raise RejectionError(
                    "spotify_connect_expired",
                    "Connecting Spotify expired. Click Connect Spotify again.",
                    401,
                )
            workspace_uuid = await session.scalar(
                select(workspaces.c.uuid).where(
                    workspaces.c.id == grant["workspace_id"]
                )
            )
            workspace = await owned_workspace(session, actor, workspace_uuid)
            row = await require_connection(session, workspace["id"])
        failure = None
        if error or not code:
            failure = SpotifyError("access_denied")
        else:
            secret = unseal(self.settings.connection_secret_key, row["secret"])
            try:
                tokens = await self.accounts(
                    row["client_id"], secret["client_secret"]
                ).exchange(code, self.redirect_uri, grant["verifier"])
                me = await self.api(tokens.access_token).me()
            except SpotifyError as caught:
                failure = caught
        async with self.sessions() as session, session.begin():
            if failure:
                values = {"state": "error", "error": failure.code}
            else:
                values = {
                    "state": "connected",
                    "error": None,
                    "account_name": me["name"][:200],
                    "connected_at": datetime.now(UTC),
                    "secret": seal(
                        self.settings.connection_secret_key,
                        {**secret, "refresh_token": tokens.refresh_token},
                    ),
                }
            await session.execute(
                update(connections)
                .where(connections.c.id == row["id"])
                .values(**values)
            )

    async def disconnect(self, actor, workspace_uuid) -> None:
        """Forget the app credentials and token. The catalog and its links stay."""
        async with self.sessions() as session, session.begin():
            workspace = await owned_workspace(session, actor, workspace_uuid, lock=True)
            await session.execute(
                delete(connections).where(
                    connections.c.workspace_id == workspace["id"],
                    connections.c.service == "spotify",
                )
            )

    async def _session_api(self, actor, workspace_uuid):
        """A fresh access token for a connected Workspace; rotates the refresh token."""
        key = self.settings.connection_secret_key
        async with self.sessions() as session, session.begin():
            workspace = await owned_workspace(session, actor, workspace_uuid)
            row = await require_connection(session, workspace["id"])
        if row["state"] != "connected":
            code = row["error"] or "not_connected"
            raise RejectionError(
                f"spotify_{code}",
                ERRORS.get(code, "Click Connect Spotify in Settings first."),
                409,
            )
        secret = unseal(key, row["secret"])
        try:
            tokens = await self.accounts(
                row["client_id"], secret["client_secret"]
            ).refresh(secret["refresh_token"])
        except SpotifyError as error:
            await record_failure(self.sessions, workspace["id"], error)
            raise rejection(error) from None
        if tokens.refresh_token and tokens.refresh_token != secret["refresh_token"]:
            async with self.sessions() as session, session.begin():
                await session.execute(
                    update(connections)
                    .where(connections.c.id == row["id"])
                    .values(
                        secret=seal(
                            key, {**secret, "refresh_token": tokens.refresh_token}
                        )
                    )
                )
        return workspace, self.api(tokens.access_token)

    async def _call(self, workspace, call):
        try:
            return await call
        except SpotifyError as error:
            await record_failure(self.sessions, workspace["id"], error)
            raise rejection(error) from None

    async def search(self, actor, workspace_uuid, query: str) -> list[dict]:
        """Albums on Spotify, each with the catalog album it already maps to."""
        workspace, api = await self._session_api(actor, workspace_uuid)
        found = await self._call(workspace, api.search_albums(query))
        async with self.sessions() as session:
            result = []
            for album in found:
                link = await repo.linked(session, workspace["id"], "spotify", album.ref)
                result.append(
                    {
                        "ref": album.ref,
                        "title": album.title,
                        "artists": [name for _, name in album.artists],
                        "released": album.released.isoformat(),
                        "tracks": album.tracks,
                        "image_url": album.image_url,
                        "in_catalog": bool(link),
                    }
                )
        return result

    async def import_album(self, actor, workspace_uuid, ref: str) -> UUID:
        """Make a catalog record from a Spotify album; Spotify becomes one link."""
        workspace, api = await self._session_api(actor, workspace_uuid)
        album = await self._call(workspace, api.album(ref))
        async with self.sessions() as session, session.begin():
            await owned_workspace(session, actor, workspace_uuid, lock=True)
            return await import_remote(session, workspace["id"], album, "search")

    async def sync(self, actor, workspace_uuid) -> dict:
        """Read listening signals and import the albums they point at."""
        workspace, api = await self._session_api(actor, workspace_uuid)
        policy = policy_of(workspace["policy"])
        followed = await self._call(workspace, api.followed_artists())
        top = await self._call(workspace, api.top_artists())
        top_albums = await self._call(workspace, api.top_track_albums())
        recent_albums = await self._call(workspace, api.recent_track_albums())
        top_count = Counter(a["uri"] for a in top_albums)
        recent_count = Counter(a["uri"] for a in recent_albums)

        # Albums worth a catalog record: new releases from followed and top
        # artists (Currents), albums holding several top tracks (Gold), and
        # albums played a lot lately (First plays).
        wanted = new_release_window(policy)
        refs: dict[str, None] = {}
        for artist_ref, _ in [*followed, *top][:30]:
            for item in await self._call(workspace, api.artist_albums(artist_ref)):
                released = item["release_date"]
                if len(released) == 10 and wanted[0] <= date.fromisoformat(released):
                    refs[item["uri"]] = None
        refs.update(
            dict.fromkeys(u for u, n in top_count.items() if n >= GOLD_TOP_TRACKS)
        )
        refs.update(
            dict.fromkeys(
                u for u, n in recent_count.items() if n >= RECENT_TRACKS_FOR_FIRST_PLAY
            )
        )

        imported = 0
        async with self.sessions() as session:
            missing = [
                ref
                for ref in refs
                if not await repo.linked(session, workspace["id"], "spotify", ref)
            ][:MAX_IMPORTS]
        fetched = [await self._call(workspace, api.album(ref)) for ref in missing]
        async with self.sessions() as session, session.begin():
            await owned_workspace(session, actor, workspace_uuid, lock=True)
            for album in fetched:
                await import_remote(session, workspace["id"], album, "import")
                imported += 1

            async def artist_ids(pairs):
                return [
                    str(await artist_uuid(session, workspace["id"], ref, name))
                    for ref, name in pairs
                ]

            async def album_counts(counts):
                result = {}
                for ref, n in counts.items():
                    link = await repo.linked(session, workspace["id"], "spotify", ref)
                    if link:
                        result[str(await album_uuid(session, link["album_id"]))] = n
                return result

            data = {
                "followed_artist_ids": await artist_ids(followed),
                "top_artist_ids": await artist_ids(top),
                "top_tracks": await album_counts(top_count),
                "recent_tracks": await album_counts(recent_count),
            }
            now = datetime.now(UTC)
            await session.execute(
                delete(signals).where(signals.c.workspace_id == workspace["id"])
            )
            await session.execute(
                insert(signals).values(
                    workspace_id=workspace["id"], synced_at=now, data=data
                )
            )
            await session.execute(
                update(connections)
                .where(
                    connections.c.workspace_id == workspace["id"],
                    connections.c.service == "spotify",
                )
                .values(synced_at=now)
            )
        return {"imported": imported}

    async def send(self, actor, workspace_uuid, name: str, album_refs: list[str]):
        """Create or replace the week's private playlist with every track in order."""
        workspace, api = await self._session_api(actor, workspace_uuid)
        tracks: list[str] = []
        for ref in album_refs:
            tracks += await self._call(workspace, api.album_track_refs(ref))
        async with self.sessions() as session:
            week = await repo.open_week(session, workspace["id"])
        previous = (week["sent"] or {}).get("playlist_ref")
        playlist = previous or await self._call(
            workspace,
            api.create_playlist(
                name, "Programmed in Palinsesto. Whole albums, in order."
            ),
        )
        await self._call(workspace, api.replace_playlist(playlist, tracks))
        return playlist, len(tracks)


def new_release_window(policy: Policy) -> tuple[date, date]:
    today = datetime.now(UTC).date()
    return (today - timedelta(days=policy.current_window_days + 7), today)


async def artist_uuid(session, workspace_id, ref, name) -> UUID:
    artist = await repo.artist_for(session, workspace_id, ref, name)
    return await session.scalar(select(artists.c.uuid).where(artists.c.id == artist))


async def album_uuid(session, album_id) -> UUID:
    return await session.scalar(select(albums.c.uuid).where(albums.c.id == album_id))


async def import_remote(session, workspace_id, album: RemoteAlbum, matched_by) -> UUID:
    """A catalog album for a Spotify album, reusing an existing link. Caller owns
    the transaction. Spotify has no album genres, so a new album starts unsorted."""
    found = await repo.linked(session, workspace_id, "spotify", album.ref)
    if found:
        return await album_uuid(session, found["album_id"])
    row = (
        (
            await session.execute(
                insert(albums)
                .values(
                    workspace_id=workspace_id,
                    title=album.title[:500],
                    released=album.released,
                    tracks=max(1, album.tracks),
                    seconds=max(1, album.seconds or 0),
                    genre="unsorted",
                    upc=album.upc,
                    image_url=album.image_url,
                )
                .returning(albums.c.id, albums.c.uuid)
            )
        )
        .mappings()
        .one()
    )
    credited: list[int] = []
    for ref, name in album.artists:
        artist = await repo.artist_for(session, workspace_id, ref, name)
        if artist not in credited:
            credited.append(artist)
    for position, artist in enumerate(credited):
        await session.execute(
            insert(album_artists).values(
                album_id=row["id"], artist_id=artist, position=position
            )
        )
    await session.execute(
        insert(service_links).values(
            workspace_id=workspace_id,
            album_id=row["id"],
            service="spotify",
            ref=album.ref,
            matched_by=matched_by,
        )
    )
    return row["uuid"]
