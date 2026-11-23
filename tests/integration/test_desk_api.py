"""Sign-in, the desk API and the Spotify connection on real Postgres.

Auth0 is the synthetic OIDC fixture and Spotify is tests/fakes/spotify_server.py,
both in process. Needs PALINSESTO_TEST_DATABASE_URL pointing at a migrated,
disposable database whose name contains "test".
"""

import asyncio
import os
from urllib.parse import parse_qs, urlsplit
from uuid import uuid4

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from palinsesto.app import create_app
from palinsesto.config import Settings
from palinsesto.db import get_session
from palinsesto.models.connections import connections
from palinsesto.oidc import OIDCProvider
from palinsesto.services.browser_auth import provision
from tests.fakes import spotify_server as spotify
from tests.oidc_fixture import SyntheticOIDC

URL = os.environ.get("PALINSESTO_TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="Requires isolated Postgres")


class Harness:
    def __init__(self):
        assert URL and "test" in URL.rsplit("/", 1)[-1]
        self.engine = create_async_engine(URL)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.oidc = SyntheticOIDC()
        # A unique issuer gives every test its own User and Workspace.
        self.oidc.issuer += "/" + uuid4().hex
        self.spotify = spotify.FakeSpotify()
        self.config = Settings(
            oidc_issuer=self.oidc.issuer,
            oidc_client_id="synthetic-client",
            oidc_client_secret="synthetic-client-secret",
            browser_origin=self.oidc.origin,
            browser_csrf_secret="synthetic-csrf-secret-at-least-32-characters",
            oidc_allowed_emails=["synthetic@example.test"],
            connection_secret_key=Fernet.generate_key().decode(),
            spotify_accounts_url=spotify.ACCOUNTS,
            spotify_api_url=spotify.API,
        )
        app = create_app()
        app.state.auth_settings = self.config
        app.state.sessions = self.sessions
        self.spotify_transport = httpx.ASGITransport(app=self.spotify.app)
        app.state.spotify_transport = self.spotify_transport
        app.state.oidc_provider = OIDCProvider(
            self.config, transport=httpx.MockTransport(self.oidc_request)
        )

        async def session_dependency():
            async with self.sessions() as db:
                yield db

        app.dependency_overrides[get_session] = session_dependency
        self.browser = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url=self.oidc.origin
        )

    async def oidc_request(self, request):
        url = request.url.copy_with(path="/" + request.url.path.split("/", 2)[-1])
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=self.oidc.app)
        ) as client:
            return await client.request(
                request.method, url, content=request.content, headers=request.headers
            )

    async def provision(self):
        async with self.sessions() as db, db.begin():
            await provision(db, self.oidc.issuer, "synthetic-user")

    async def sign_in(self):
        login = await self.browser.get("/api/auth/login")
        assert login.status_code == 302, login.text
        auth = await self.oidc_request(httpx.Request("GET", login.headers["location"]))
        done = await self.browser.get(auth.headers["location"])
        assert done.status_code == 303, done.text
        session = (await self.browser.get("/api/auth/session")).json()
        self.workspace = session["workspace"]["id"]
        self.headers = {
            "Origin": self.oidc.origin,
            "X-CSRF-Token": session["csrf_token"],
        }
        return session

    def path(self, tail):
        return f"/api/workspaces/{self.workspace}{tail}"

    async def call(self, method, tail, status=200, **kwargs):
        response = await self.browser.request(
            method, self.path(tail), headers=self.headers, **kwargs
        )
        assert response.status_code == status, response.text
        return response.json()

    async def connect_spotify(self):
        """Click Connect, follow Spotify's consent, and come back to Settings."""
        start = await self.browser.get(self.path("/spotify/connect"))
        assert start.status_code == 302, start.text
        async with httpx.AsyncClient(transport=self.spotify_transport) as spotify_web:
            consent = await spotify_web.get(start.headers["location"])
        if consent.status_code != 302:
            return consent
        back = await self.browser.get(consent.headers["location"])
        assert back.status_code == 303 and back.headers["location"] == "/#/settings"
        return back

    async def close(self):
        await self.browser.aclose()
        await self.engine.dispose()


def run(scenario):
    async def wrapped():
        h = Harness()
        try:
            await scenario(h)
        finally:
            await h.close()

    asyncio.run(wrapped())


CREDENTIALS = {"client_id": spotify.CLIENT_ID, "client_secret": spotify.CLIENT_SECRET}


def test_sign_in_needs_an_operator_provisioned_identity():
    async def scenario(h):
        assert (await h.browser.get("/api/auth/session")).status_code == 401
        # An allowlisted email alone is not enough: no account is created.
        login = await h.browser.get("/api/auth/login")
        auth = await h.oidc_request(httpx.Request("GET", login.headers["location"]))
        refused = await h.browser.get(auth.headers["location"])
        assert refused.status_code == 403
        assert refused.json()["detail"]["code"] == "identity_setup_required"
        assert (await h.browser.get("/api/auth/session")).status_code == 401

        await h.provision()
        first = await h.sign_in()
        desk = await h.call("GET", "/desk")
        assert desk["spotify"] == {"state": "not_set_up"}
        assert [w["closed"] for w in desk["weeks"]] == [False]
        # Signing in again reuses the same Workspace.
        assert (await h.sign_in())["workspace"] == first["workspace"]
        # Someone else's (or a made-up) Workspace is not found, not forbidden.
        other = await h.browser.get(f"/api/workspaces/{uuid4()}/desk")
        assert other.status_code == 404
        # Writes need the CSRF token from the session.
        forged = await h.browser.post(h.path("/log/close"))
        assert forged.status_code == 403

    run(scenario)


def test_programming_a_week_from_spotify_to_the_log_book():
    async def scenario(h):
        await h.provision()
        await h.sign_in()
        desk = await h.call("PUT", "/spotify/credentials", json=CREDENTIALS)
        assert desk["spotify"]["state"] == "credentials"
        setup = await h.call("GET", "/spotify/setup")
        assert setup == {
            "redirect_uri": "https://palinsesto.test/api/spotify/callback",
            "redirect_problem": None,
        }
        await h.connect_spotify()
        desk = await h.call("GET", "/desk")
        assert desk["spotify"]["state"] == "connected"
        assert desk["spotify"]["account_name"] == "Synthetic Listener"

        synced = await h.call("POST", "/spotify/sync")
        desk = synced["desk"]
        titles = {a["title"]: a for a in desk["albums"].values()}
        # Night Ferry (two top tracks) and Paper Harbour (three recent plays) are
        # imported; Low Orbit (one top track, old release) is not.
        assert {"Night Ferry", "Paper Harbour"} <= set(titles)
        assert "Low Orbit" not in titles
        assert all(a["genre"] == "unsorted" for a in titles.values())
        lanes = {c["album_id"]: c["lane"] for c in desk["candidates"]}
        assert lanes[titles["Night Ferry"]["id"]] == "gold"
        assert lanes[titles["Paper Harbour"]["id"]] == "first"

        found = await h.call("POST", "/spotify/search", json={"q": "brass"})
        assert [f["title"] for f in found] == ["Brass Weather"]
        desk = await h.call(
            "POST", "/spotify/import", json={"ref": found[0]["ref"], "add": True}
        )
        ferry = titles["Night Ferry"]["id"]
        desk = await h.call("POST", "/log/entries", json={"album_id": ferry})
        desk = await h.call("POST", "/log/move", json={"album_id": ferry, "to": 0})
        week = desk["weeks"][-1]
        assert [desk["albums"][e["album_id"]]["title"] for e in week["entries"]] == [
            "Night Ferry",
            "Brass Weather",
        ]
        assert week["entries"][0]["lane"] == "gold"
        assert (
            week["entries"][0]["reason"]
            == "2 of your top tracks are on it. Never logged."
        )

        desk = await h.call("POST", "/spotify/send")
        sent = desk["weeks"][-1]["sent"]
        playlist = h.spotify.playlists[sent["playlist_ref"].rsplit(":", 1)[-1]]
        assert len(playlist["items"]) == sent["tracks"] == 4 + 3
        assert playlist["public"] is False

        # A verdict belongs on a closed week.
        week_id = desk["current_week_id"]
        entry = f"/weeks/{week_id}/entries/{ferry}"
        await h.call("PATCH", entry, status=409, json={"verdict": "heavy"})
        desk = await h.call("POST", "/log/close")
        assert desk["current_week_id"] != week_id
        desk = await h.call("PATCH", entry, json={"verdict": "heavy", "note": "Loud."})
        logged = next(w for w in desk["weeks"] if w["id"] == week_id)
        assert (logged["entries"][0]["verdict"], logged["entries"][0]["note"]) == (
            "heavy",
            "Loud.",
        )
        # The new week starts empty and Night Ferry waits out its Gold cooldown.
        assert desk["weeks"][-1]["entries"] == []
        assert ferry not in {c["album_id"] for c in desk["candidates"]}

        # No response ever carried the secret or a token.
        async with h.sessions() as db:
            row = (await db.execute(select(connections))).mappings().all()
        stored = next(r for r in row if r["client_id"] == spotify.CLIENT_ID)
        assert spotify.CLIENT_SECRET not in stored["secret"]
        assert spotify.CLIENT_SECRET not in str(desk)

    run(scenario)


def test_policy_validation():
    async def scenario(h):
        await h.provision()
        await h.sign_in()
        policy = (await h.call("GET", "/desk"))["policy"]
        desk = await h.call("PUT", "/policy", json={**policy, "min_gold": 3})
        assert desk["policy"]["min_gold"] == 3
        assert any(c["label"] == "At least 3 from gold" for c in desk["checks"])
        await h.call("PUT", "/policy", status=422, json={**policy, "min_hours": 9})

    run(scenario)


def test_each_setup_error_is_stored_with_its_fix():
    async def scenario(h):
        await h.provision()
        await h.sign_in()
        wrong = {**CREDENTIALS, "client_secret": "0" * 32}
        refused = await h.call("PUT", "/spotify/credentials", status=409, json=wrong)
        assert refused["detail"]["code"] == "spotify_invalid_client"
        assert "Copy both again" in refused["detail"]["message"]

        await h.call("PUT", "/spotify/credentials", json=CREDENTIALS)
        h.spotify.redirect_uris = set()
        page = await h.connect_spotify()
        # Spotify stops on its own page; Palinsesto stays at "credentials".
        assert "Invalid redirect URI" in page.text
        h.spotify.redirect_uris = {"https://palinsesto.test/api/spotify/callback"}

        h.spotify.allowlisted = False
        await h.connect_spotify()
        assert (await h.call("GET", "/desk"))["spotify"]["error"] == "not_allowlisted"

        h.spotify.allowlisted = True
        await h.connect_spotify()
        h.spotify.premium = False
        refused = await h.call("POST", "/spotify/sync", status=409)
        assert refused["detail"]["code"] == "spotify_premium_required"
        state = (await h.call("GET", "/desk"))["spotify"]
        assert (state["state"], state["error"]) == ("error", "premium_required")

        h.spotify.premium = True
        await h.connect_spotify()
        h.spotify.revoke()
        refused = await h.call("POST", "/spotify/search", status=409, json={"q": "x"})
        assert refused["detail"]["code"] == "spotify_token_revoked"
        await h.connect_spotify()
        assert (await h.call("GET", "/desk"))["spotify"]["state"] == "connected"

        desk = await h.call("DELETE", "/spotify")
        assert desk["spotify"] == {"state": "not_set_up"}

    run(scenario)


def test_cancelled_consent_is_access_denied():
    async def scenario(h):
        await h.provision()
        await h.sign_in()
        await h.call("PUT", "/spotify/credentials", json=CREDENTIALS)
        start = await h.browser.get(h.path("/spotify/connect"))
        query = parse_qs(urlsplit(start.headers["location"]).query)
        denied = (
            query["redirect_uri"][0] + "?error=access_denied&state=" + query["state"][0]
        )
        assert (await h.browser.get(denied)).status_code == 303
        state = (await h.call("GET", "/desk"))["spotify"]
        assert (state["state"], state["error"]) == ("error", "access_denied")

    run(scenario)
