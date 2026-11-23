"""Actual signed-token validation with an in-process synthetic provider."""

import asyncio

import httpx
import pytest
from joserfc.errors import JoseError
from joserfc.jwk import OctKey, RSAKey

from palinsesto.config import Settings
from palinsesto.oidc import OIDCProvider
from tests.oidc_fixture import SyntheticOIDC


@pytest.mark.parametrize(
    "failure",
    ["signature", "algorithm", "nonce", "issuer", "audience", "expiry", "none"],
)
def test_signed_identity_validation(failure):
    asyncio.run(signed_identity(failure))


async def signed_identity(failure):
    fixture = SyntheticOIDC()
    config = Settings(
        oidc_issuer=fixture.issuer,
        oidc_client_id="synthetic-client",
        oidc_client_secret="synthetic-client-secret",
        browser_origin=fixture.origin,
        browser_csrf_secret="synthetic-secret-longer-than-32-characters",
    )
    transport = httpx.ASGITransport(app=fixture.app)
    provider = OIDCProvider(config, transport=transport)
    # Separate signing key from published key to exercise signature verification.
    fixture.signing_key = fixture.key
    if failure == "signature":
        fixture.signing_key = RSAKey.generate_key(2048, parameters={"kid": "synthetic"})
    if failure == "algorithm":
        fixture.signing_key = OctKey.generate_key(256)
        fixture.signing_algorithm = "HS256"
    fixture.claim_overrides = {
        "nonce": {"nonce": "wrong", "nonce_supported": False},
        "issuer": {"iss": "https://wrong.test"},
        "audience": {"aud": "wrong"},
        "expiry": {"exp": 1},
    }.get(failure, {})
    url = await provider.authorization_url(
        "synthetic-state",
        "synthetic-nonce",
        "synthetic-verifier-very-long-value-12345678901234567890",
    )
    async with httpx.AsyncClient(transport=transport) as client:
        redirect = await client.get(url)
    code = httpx.URL(redirect.headers["location"]).params["code"]
    if failure == "none":
        identity = await provider.identity(
            code,
            "synthetic-nonce",
            "synthetic-verifier-very-long-value-12345678901234567890",
        )
        assert identity["sub"] == "synthetic-user"
    else:
        with pytest.raises((JoseError, ValueError)):
            await provider.identity(
                code,
                "synthetic-nonce",
                "synthetic-verifier-very-long-value-12345678901234567890",
            )
