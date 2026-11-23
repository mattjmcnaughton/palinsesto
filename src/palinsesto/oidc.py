"""Small OIDC code-flow adapter; no financial or account-creation authority."""

import hmac
from urllib.parse import urlsplit

import httpx
from authlib.integrations.httpx_client import AsyncOAuth2Client
from authlib.oidc.core import CodeIDToken
from joserfc import jwt
from joserfc.jwk import KeySet

from palinsesto.services.access import RejectionError


def trusted_url(value):
    url = urlsplit(value)
    return (
        bool(url.hostname)
        and not url.username
        and not url.fragment
        and (
            url.scheme == "https"
            or (
                url.scheme == "http"
                and url.hostname in {"localhost", "127.0.0.1", "::1"}
            )
        )
    )


class OIDCProvider:
    def __init__(self, settings, *, transport=None):
        self.settings = settings
        self.transport = transport

    def configured(self):
        config = self.settings
        origin = urlsplit(config.browser_origin)
        if not (
            trusted_url(config.oidc_issuer)
            and trusted_url(config.browser_origin)
            and origin.path in {"", "/"}
            and not origin.query
            and not origin.fragment
            and not origin.username
            and config.oidc_client_id
            and len(config.browser_csrf_secret.get_secret_value()) >= 32
        ):
            raise RejectionError(
                "sign_in_unavailable", "Browser sign-in is not configured.", 503
            )

    @property
    def redirect_uri(self):
        return self.settings.browser_origin.rstrip("/") + "/api/auth/callback"

    async def metadata(self):
        self.configured()
        async with httpx.AsyncClient(
            transport=self.transport, timeout=10, follow_redirects=False
        ) as client:
            response = await client.get(
                self.settings.oidc_issuer.rstrip("/")
                + "/.well-known/openid-configuration"
            )
            response.raise_for_status()
            data = response.json()
        if data.get("issuer") != self.settings.oidc_issuer:
            raise ValueError("Unexpected issuer")
        for field in ("authorization_endpoint", "token_endpoint", "jwks_uri"):
            if not trusted_url(data.get(field, "")):
                raise ValueError("Untrusted provider endpoint")
        return data

    def client(self):
        return AsyncOAuth2Client(
            client_id=self.settings.oidc_client_id,
            client_secret=self.settings.oidc_client_secret.get_secret_value(),
            token_endpoint_auth_method="client_secret_basic",
            redirect_uri=self.redirect_uri,
            scope="openid email",
            code_challenge_method="S256",
            transport=self.transport,
            timeout=10,
            follow_redirects=False,
        )

    async def authorization_url(self, state, nonce, verifier):
        metadata = await self.metadata()
        async with self.client() as client:
            url, _ = client.create_authorization_url(
                metadata["authorization_endpoint"],
                state=state,
                nonce=nonce,
                code_verifier=verifier,
            )
        return url

    async def identity(self, code, nonce, verifier):
        metadata = await self.metadata()
        async with self.client() as client:
            token = await client.fetch_token(
                metadata["token_endpoint"],
                code=code,
                code_verifier=verifier,
            )
        async with httpx.AsyncClient(
            transport=self.transport, timeout=10, follow_redirects=False
        ) as client:
            response = await client.get(metadata["jwks_uri"])
            response.raise_for_status()
            keys = KeySet.import_key_set(response.json())
        decoded = jwt.decode(token["id_token"], keys, algorithms=["RS256", "ES256"])
        claims = CodeIDToken(
            decoded.claims,
            decoded.header,
            {
                "iss": {"essential": True, "value": self.settings.oidc_issuer},
                "aud": {"essential": True, "value": self.settings.oidc_client_id},
            },
            {
                "nonce": nonce,
                "client_id": self.settings.oidc_client_id,
                "access_token": token.get("access_token"),
            },
        )
        claims.validate(leeway=0)
        # Require nonce even for providers advertising nonce_supported=false.
        if not isinstance(claims.get("nonce"), str) or not hmac.compare_digest(
            claims["nonce"], nonce
        ):
            raise ValueError("Invalid nonce")
        if not isinstance(claims.get("sub"), str) or not claims["sub"]:
            raise ValueError("Invalid subject")
        return dict(claims)
