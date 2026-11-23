"""Local synthetic OIDC provider; never included in application startup.

Serve with uvicorn tests.oidc_fixture:app. Configure PALINSESTO_TEST_OIDC_ISSUER
and PALINSESTO_TEST_BROWSER_ORIGIN to dedicated loopback ports. Every process has
an ephemeral RSA signing key, and codes require the recorded S256 PKCE proof.
"""

import base64
import hashlib
import os
import secrets
import time
from urllib.parse import urlencode

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from joserfc import jwt
from joserfc.jwk import OctKey, RSAKey


class SyntheticOIDC:
    def __init__(
        self, issuer="https://identity.test", origin="https://palinsesto.test"
    ):
        self.issuer, self.origin = issuer, origin
        self.key = RSAKey.generate_key(2048, parameters={"kid": "synthetic"})
        self.signing_key: RSAKey | OctKey = self.key
        self.signing_algorithm = "RS256"
        self.claim_overrides = {}
        self.codes = {}
        self.exchange_count = 0
        self.app = FastAPI()

        @self.app.get("/.well-known/openid-configuration")
        async def metadata():
            return {
                "issuer": self.issuer,
                "authorization_endpoint": self.issuer + "/authorize",
                "token_endpoint": self.issuer + "/token",
                "jwks_uri": self.issuer + "/jwks",
            }

        @self.app.get("/jwks")
        async def jwks():
            return {"keys": [self.key.as_dict(private=False)]}

        @self.app.get("/authorize")
        async def authorize(request: Request):
            params = dict(request.query_params)
            assert params["client_id"] == "synthetic-client"
            assert params["redirect_uri"] == self.origin + "/api/auth/callback"
            assert params["response_type"] == "code"
            assert params["code_challenge_method"] == "S256"
            assert params["nonce"] and params["state"]
            code = secrets.token_urlsafe(32)
            self.codes[code] = params
            return RedirectResponse(
                params["redirect_uri"]
                + "?"
                + urlencode({"code": code, "state": params["state"]}),
                status_code=302,
            )

        @self.app.post("/token")
        async def token(request: Request):
            from urllib.parse import parse_qs

            body = parse_qs((await request.body()).decode())
            params = self.codes.pop(body.get("code", [""])[0], None)
            if not params:
                return JSONResponse({"error": "invalid_grant"}, status_code=400)
            verifier = body.get("code_verifier", [""])[0]
            challenge = (
                base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest())
                .rstrip(b"=")
                .decode()
            )
            if (
                challenge != params["code_challenge"]
                or body.get("redirect_uri", [""])[0] != params["redirect_uri"]
            ):
                return JSONResponse({"error": "invalid_grant"}, status_code=400)
            self.exchange_count += 1
            claims = {
                "iss": self.issuer,
                "sub": "synthetic-user",
                "aud": "synthetic-client",
                "iat": int(time.time()),
                "exp": int(time.time()) + 300,
                "nonce": params["nonce"],
                "email": "synthetic@example.test",
                "email_verified": True,
                **self.claim_overrides,
            }
            signed = jwt.encode(
                {"alg": self.signing_algorithm, "kid": "synthetic"},
                claims,
                self.signing_key,
            )
            return {
                "id_token": signed,
                "access_token": "synthetic-not-retained",
                "token_type": "Bearer",
            }


fixture = SyntheticOIDC(
    os.environ.get("PALINSESTO_TEST_OIDC_ISSUER", "http://127.0.0.1:55439"),
    os.environ.get("PALINSESTO_TEST_BROWSER_ORIGIN", "http://127.0.0.1:55438"),
)
app = fixture.app
