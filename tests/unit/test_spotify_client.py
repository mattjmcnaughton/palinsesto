"""The Spotify adapter against the fake server: mapping, paging and each error."""

import asyncio
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest

from palinsesto.integrations.spotify import (
    SpotifyAccounts,
    SpotifyApi,
    SpotifyError,
    pkce_pair,
    redirect_problem,
)
from tests.fakes import spotify_server as fake_module

REDIRECT = "https://palinsesto.test/api/spotify/callback"


def clients(fake, secret=fake_module.CLIENT_SECRET):
    transport = httpx.ASGITransport(app=fake.app)
    accounts = SpotifyAccounts(
        fake_module.CLIENT_ID,
        secret,
        base_url=fake_module.ACCOUNTS,
        transport=transport,
    )
    return accounts, transport


async def connect(fake, redirect=REDIRECT):
    accounts, transport = clients(fake)
    verifier, challenge = pkce_pair()
    url = accounts.authorize_url(redirect, "state-1", challenge)
    async with httpx.AsyncClient(transport=transport) as browser:
        answer = await browser.get(url)
    if answer.status_code != 302:
        return accounts, transport, answer
    code = parse_qs(urlsplit(answer.headers["location"]).query)["code"][0]
    tokens = await accounts.exchange(code, redirect, verifier)
    api = SpotifyApi(tokens.access_token, base_url=fake_module.API, transport=transport)
    return accounts, tokens, api


def run(coro):
    return asyncio.run(coro)


@pytest.mark.parametrize(
    ("uri", "problem"),
    [
        ("https://palinsesto.example/api/spotify/callback", None),
        ("http://127.0.0.1:8000/api/spotify/callback", None),
        ("http://127.0.0.1/api/spotify/callback", "loopback_without_port"),
        ("http://localhost:8000/api/spotify/callback", "localhost"),
        ("http://palinsesto.example/api/spotify/callback", "not_https"),
    ],
)
def test_redirect_rules(uri, problem):
    assert redirect_problem(uri) == problem


def test_album_reads_total_every_track_page():
    fake = fake_module.FakeSpotify()
    fake.page_size = 2  # Tidal Lamps has 4 tracks: two pages.

    async def scenario():
        _, _, api = await connect(fake)
        lamps = fake.by_title("Tidal Lamps")
        album = await api.album(lamps["uri"])
        assert album.seconds == 312 + 288 + 401 + 255
        assert album.tracks == 4 and album.upc == "000000000101"
        assert album.artists == ((lamps["artists"][0]["uri"], "Marisol Vane"),)
        assert len(await api.album_track_refs(lamps["uri"])) == 4

    run(scenario())


def test_playlist_replace_keeps_order_past_one_hundred():
    fake = fake_module.FakeSpotify()

    async def scenario():
        _, _, api = await connect(fake)
        ref = await api.create_playlist("Week 47", "")
        tracks = [f"spotify:track:{i:022d}" for i in range(230)]
        await api.replace_playlist(ref, tracks)
        stored = fake.playlists[ref.rsplit(":", 1)[-1]]
        assert stored["items"] == tracks and stored["public"] is False

    run(scenario())


def test_wrong_secret_is_invalid_client():
    accounts, _ = clients(fake_module.FakeSpotify(), secret="0" * 32)
    with pytest.raises(SpotifyError) as caught:
        run(accounts.verify())
    assert caught.value.code == "invalid_client"


def test_unregistered_redirect_stops_on_spotifys_page():
    fake = fake_module.FakeSpotify(redirect_uris=())
    _, _, answer = run(connect(fake))
    assert answer.status_code == 400
    assert "INVALID_CLIENT: Invalid redirect URI" in answer.text


def test_exchange_with_another_redirect_is_redirect_mismatch():
    fake = fake_module.FakeSpotify()

    async def scenario():
        accounts, transport = clients(fake)
        verifier, challenge = pkce_pair()
        url = accounts.authorize_url(REDIRECT, "s", challenge)
        async with httpx.AsyncClient(transport=transport) as browser:
            location = (await browser.get(url)).headers["location"]
        code = parse_qs(urlsplit(location).query)["code"][0]
        await accounts.exchange(code, "https://elsewhere.test/cb", verifier)

    with pytest.raises(SpotifyError) as caught:
        run(scenario())
    assert caught.value.code == "redirect_mismatch"


@pytest.mark.parametrize(
    ("switch", "code"),
    [("allowlisted", "not_allowlisted"), ("premium", "premium_required")],
)
def test_forbidden_calls_say_why(switch, code):
    fake = fake_module.FakeSpotify()

    async def scenario():
        _, _, api = await connect(fake)
        setattr(fake, switch, False)
        await api.me()

    with pytest.raises(SpotifyError) as caught:
        run(scenario())
    assert (caught.value.code, caught.value.status) == (code, 403)


def test_revoked_refresh_token():
    fake = fake_module.FakeSpotify()

    async def scenario():
        accounts, tokens, _ = await connect(fake)
        await accounts.refresh(tokens.refresh_token)
        fake.revoke()
        await accounts.refresh(tokens.refresh_token)

    with pytest.raises(SpotifyError) as caught:
        run(scenario())
    assert caught.value.code == "token_revoked"
