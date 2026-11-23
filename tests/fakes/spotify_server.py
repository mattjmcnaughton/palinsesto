"""A small fake of Spotify's accounts service and the Web API endpoints Palinsesto uses.

One Starlette app serves both hosts: `/authorize` and `/api/token` stand in for
accounts.spotify.com, and `/v1/...` for api.spotify.com. Response shapes follow
Spotify's documented objects after the February 2026 development-mode changes
(no album label, search capped at 10, playlists through /items).

Switches reproduce the failures the setup guide explains:

- a wrong client secret: the token endpoint answers 400 `invalid_client`
- an unregistered redirect URI: /authorize renders Spotify's INVALID_CLIENT page
  and never redirects back; a code exchanged with another URI is `invalid_grant`
- `allowlisted = False`: every Web API call answers 403, as for a user missing
  from User Management
- `premium = False`: every Web API call answers 403 about the owner's Premium
- `revoke()`: refresh answers 400 `invalid_grant` "Refresh token revoked"

In tests, route both base URLs to `httpx.ASGITransport(app=fake.app)`. Every
artist, album and account here is invented.
"""

import base64
import hashlib
import secrets
from urllib.parse import parse_qs, urlencode

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse, RedirectResponse
from starlette.routing import Route

CLIENT_ID = "0123456789abcdef0123456789abcdef"
CLIENT_SECRET = "fedcba9876543210fedcba9876543210"
ACCOUNTS = "https://accounts.spotify.test"
API = "https://api.spotify.test/v1"


def sid(seed: str) -> str:
    """A stable 22-character base62 ID."""
    alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
    n = int(hashlib.sha256(seed.encode()).hexdigest(), 16)
    out = ""
    for _ in range(22):
        n, rem = divmod(n, 62)
        out += alphabet[rem]
    return out


def artist(name):
    return {"id": sid(name), "uri": f"spotify:artist:{sid(name)}", "name": name}


# (title, artist names, release date, track lengths in seconds, upc)
CATALOG = [
    (
        "Tidal Lamps",
        ["Marisol Vane"],
        "2026-11-13",
        [312, 288, 401, 255],
        "000000000101",
    ),
    ("Low Orbit", ["Marisol Vane"], "2021-03-05", [240, 260, 300], "000000000102"),
    (
        "Paper Harbour",
        ["The Quiet Ferns"],
        "2019-06-14",
        [200, 210, 230, 190],
        "000000000201",
    ),
    (
        "Saltmarsh",
        ["The Quiet Ferns", "Ode Kettle"],
        "2024-02-02",
        [500, 450],
        "000000000202",
    ),
    ("Brass Weather", ["Ode Kettle"], "2026-11-06", [380, 420, 360], "000000000301"),
    (
        "Night Ferry",
        ["Calder Moss"],
        "2012-10-01",
        [330, 340, 350, 360],
        "000000000401",
    ),
]


def album_object(title, artists, released, lengths, upc):
    key = sid(title)
    return {
        "album_type": "album",
        "total_tracks": len(lengths),
        "id": key,
        "uri": f"spotify:album:{key}",
        "name": title,
        "release_date": released,
        "release_date_precision": "day",
        "images": [
            {"url": f"https://i.scdn.test/{key}.jpg", "width": 640, "height": 640}
        ],
        "artists": [artist(a) for a in artists],
        "external_ids": {"upc": upc},
        "_lengths": lengths,
    }


def public(album):
    return {k: v for k, v in album.items() if not k.startswith("_")}


def tracks_of(album):
    return [
        {
            "id": sid(f"{album['id']}:{i}"),
            "uri": f"spotify:track:{sid(album['id'] + ':' + str(i))}",
            "name": f"{album['name']} {i + 1}",
            "duration_ms": seconds * 1000,
            "track_number": i + 1,
            "artists": album["artists"],
        }
        for i, seconds in enumerate(album["_lengths"])
    ]


def challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


class FakeSpotify:
    def __init__(self, redirect_uris=("https://palinsesto.test/api/spotify/callback",)):
        self.redirect_uris = set(redirect_uris)
        self.allowlisted = True
        self.premium = True
        self.albums = {a["id"]: a for a in (album_object(*row) for row in CATALOG)}
        self.followed = [artist("Marisol Vane"), artist("Ode Kettle")]
        self.top_artists = [artist("The Quiet Ferns")]
        self.codes: dict[str, dict] = {}
        self.refresh_tokens: set[str] = set()
        self.access_tokens: set[str] = set()
        self.playlists: dict[str, dict] = {}
        self.page_size = 50
        self.app = Starlette(
            routes=[
                Route("/authorize", self.authorize),
                Route("/api/token", self.token, methods=["POST"]),
                Route("/v1/me", self.me),
                Route("/v1/me/following", self.following),
                Route("/v1/me/top/artists", self.top_artist_list),
                Route("/v1/me/top/tracks", self.top_tracks),
                Route("/v1/me/player/recently-played", self.recent),
                Route("/v1/artists/{id}/albums", self.artist_albums),
                Route("/v1/albums/{id}", self.album),
                Route("/v1/albums/{id}/tracks", self.album_tracks),
                Route("/v1/search", self.search),
                Route("/v1/me/playlists", self.create_playlist, methods=["POST"]),
                Route(
                    "/v1/playlists/{id}/items",
                    self.playlist_items,
                    methods=["PUT", "POST"],
                ),
            ]
        )

    def revoke(self):
        self.refresh_tokens.clear()
        self.access_tokens.clear()

    # accounts.spotify.com

    async def authorize(self, request: Request):
        q = dict(request.query_params)
        if q.get("client_id") != CLIENT_ID:
            return HTMLResponse("INVALID_CLIENT: Invalid client", status_code=400)
        if q.get("redirect_uri") not in self.redirect_uris:
            # Spotify shows this on its own page; the app never hears about it.
            return HTMLResponse("INVALID_CLIENT: Invalid redirect URI", status_code=400)
        assert q["response_type"] == "code" and q["code_challenge_method"] == "S256"
        code = secrets.token_urlsafe(16)
        self.codes[code] = q
        target = (
            q["redirect_uri"] + "?" + urlencode({"code": code, "state": q["state"]})
        )
        return RedirectResponse(target, status_code=302)

    def deny(self, request: Request) -> str:
        """A redirect as if the person pressed Cancel on Spotify's consent page."""
        q = dict(request.query_params)
        return (
            q["redirect_uri"]
            + "?"
            + urlencode({"error": "access_denied", "state": q["state"]})
        )

    async def token(self, request: Request):
        auth = request.headers.get("authorization", "")
        expected = base64.b64encode(f"{CLIENT_ID}:{CLIENT_SECRET}".encode()).decode()
        if auth != f"Basic {expected}":
            return JSONResponse(
                {
                    "error": "invalid_client",
                    "error_description": "Invalid client secret",
                },
                status_code=400,
            )
        form = {k: v[0] for k, v in parse_qs((await request.body()).decode()).items()}
        grant = form.get("grant_type")
        if grant == "client_credentials":
            return self.issue(refresh=False)
        if grant == "authorization_code":
            params = self.codes.pop(form.get("code", ""), None)
            if params is None:
                return self.invalid_grant("Invalid authorization code")
            if form.get("redirect_uri") != params["redirect_uri"]:
                return self.invalid_grant("Invalid redirect URI")
            if challenge(form.get("code_verifier", "")) != params["code_challenge"]:
                return self.invalid_grant("code_verifier was incorrect")
            return self.issue(refresh=True)
        if grant == "refresh_token":
            if form.get("refresh_token") not in self.refresh_tokens:
                return self.invalid_grant("Refresh token revoked")
            return self.issue(refresh=False)
        return JSONResponse({"error": "unsupported_grant_type"}, status_code=400)

    def invalid_grant(self, description):
        return JSONResponse(
            {"error": "invalid_grant", "error_description": description},
            status_code=400,
        )

    def issue(self, *, refresh):
        access = secrets.token_urlsafe(16)
        self.access_tokens.add(access)
        body = {"access_token": access, "token_type": "Bearer", "expires_in": 3600}
        if refresh:
            token = secrets.token_urlsafe(16)
            self.refresh_tokens.add(token)
            body["refresh_token"] = token
            body["scope"] = "user-follow-read user-top-read"
        return JSONResponse(body)

    # api.spotify.com/v1

    def refuse(self, request: Request):
        token = request.headers.get("authorization", "").removeprefix("Bearer ")
        if token not in self.access_tokens:
            return error(401, "The access token expired")
        if not self.premium:
            return error(
                403, "Active premium subscription required for the owner of the app."
            )
        if not self.allowlisted:
            return error(
                403,
                "Check settings on developer.spotify.com/dashboard, "
                "the user may not be registered.",
            )
        return None

    async def me(self, request):
        return self.refuse(request) or JSONResponse(
            {"id": "synthetic-listener", "display_name": "Synthetic Listener"}
        )

    async def following(self, request):
        return self.refuse(request) or JSONResponse(
            {"artists": {"items": self.followed, "cursors": {"after": None}}}
        )

    async def top_artist_list(self, request):
        return self.refuse(request) or JSONResponse({"items": self.top_artists})

    async def top_tracks(self, request):
        # Two top tracks from Night Ferry make it Gold; one from Low Orbit does not.
        ferry, orbit = self.by_title("Night Ferry"), self.by_title("Low Orbit")
        picks = [(ferry, 0), (ferry, 1), (orbit, 0)]
        return self.refuse(request) or JSONResponse(
            {"items": [{**tracks_of(a)[i], "album": public(a)} for a, i in picks]}
        )

    async def recent(self, request):
        harbour = self.by_title("Paper Harbour")
        items = [
            {"track": {**t, "album": public(harbour)}} for t in tracks_of(harbour)[:3]
        ]
        return self.refuse(request) or JSONResponse({"items": items})

    async def artist_albums(self, request):
        refused = self.refuse(request)
        if refused:
            return refused
        key = request.path_params["id"]
        items = [
            public(a)
            for a in self.albums.values()
            if any(x["id"] == key for x in a["artists"])
        ]
        items.sort(key=lambda a: a["release_date"], reverse=True)
        return JSONResponse(
            {"items": items[: int(request.query_params.get("limit", 20))]}
        )

    async def album(self, request):
        refused = self.refuse(request)
        if refused:
            return refused
        found = self.albums.get(request.path_params["id"])
        if not found:
            return error(404, "Non existing id")
        tracks = tracks_of(found)
        first = tracks[: self.page_size]
        following = (
            f"{API}/albums/{found['id']}/tracks?offset={self.page_size}"
            if len(tracks) > self.page_size
            else None
        )
        return JSONResponse(
            {**public(found), "tracks": {"items": first, "next": following}}
        )

    async def album_tracks(self, request):
        refused = self.refuse(request)
        if refused:
            return refused
        found = self.albums[request.path_params["id"]]
        offset = int(request.query_params.get("offset", 0))
        tracks = tracks_of(found)
        page = tracks[offset : offset + self.page_size]
        end = offset + self.page_size
        following = (
            f"{API}/albums/{found['id']}/tracks?offset={end}"
            if end < len(tracks)
            else None
        )
        return JSONResponse({"items": page, "next": following})

    async def search(self, request):
        refused = self.refuse(request)
        if refused:
            return refused
        limit = int(request.query_params.get("limit", 5))
        if limit > 10:
            return error(400, "Invalid limit")
        words = request.query_params["q"].lower().split()
        found = [
            public(a)
            for a in self.albums.values()
            if all(
                w in f"{a['name']} {' '.join(x['name'] for x in a['artists'])}".lower()
                for w in words
            )
        ]
        return JSONResponse({"albums": {"items": found[:limit]}})

    async def create_playlist(self, request):
        refused = self.refuse(request)
        if refused:
            return refused
        body = await request.json()
        key = sid(body["name"] + str(len(self.playlists)))
        self.playlists[key] = {
            "name": body["name"],
            "public": body["public"],
            "items": [],
        }
        return JSONResponse(
            {"id": key, "uri": f"spotify:playlist:{key}"}, status_code=201
        )

    async def playlist_items(self, request):
        refused = self.refuse(request)
        if refused:
            return refused
        uris = (await request.json())["uris"]
        if len(uris) > 100:
            return error(400, "Too many items")
        playlist = self.playlists[request.path_params["id"]]
        playlist["items"] = (
            uris if request.method == "PUT" else playlist["items"] + uris
        )
        return JSONResponse({"snapshot_id": secrets.token_hex(8)}, status_code=201)

    def by_title(self, title):
        return next(a for a in self.albums.values() if a["name"] == title)


def error(status, message):
    return JSONResponse(
        {"error": {"status": status, "message": message}}, status_code=status
    )
