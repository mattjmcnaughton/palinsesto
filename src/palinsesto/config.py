"""Application configuration via environment variables."""

from pydantic import SecretStr
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    log_level: str = "INFO"
    log_format: str = "json"
    host: str = "0.0.0.0"
    port: int = 8000

    browser_origin: str = ""
    browser_csrf_secret: SecretStr = SecretStr("")
    oidc_issuer: str = ""
    oidc_client_id: str = ""
    oidc_client_secret: SecretStr = SecretStr("")
    oidc_allowed_emails: list[str] = []

    # Fernet key that encrypts service connection secrets (the Spotify client
    # secret and refresh token) at rest. Generate with
    # `uv run python -c "from cryptography.fernet import Fernet;
    # print(Fernet.generate_key().decode())"`. Without it, Spotify cannot connect.
    connection_secret_key: SecretStr = SecretStr("")
    spotify_accounts_url: str = "https://accounts.spotify.com"
    spotify_api_url: str = "https://api.spotify.com/v1"

    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@127.0.0.1:5433/palinsesto"
    )

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
