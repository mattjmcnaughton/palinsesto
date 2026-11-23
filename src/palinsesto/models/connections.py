"""A Workspace's encrypted service connection and its latest listening signals."""

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB

from palinsesto.models.accounts import created_at, table
from palinsesto.models.catalog import one_of

CONNECTION_STATES = ("credentials", "connected", "error")

# One row per Workspace and service. Bring-your-own-app: the owner's own Spotify
# client ID is stored in the clear (Spotify shows it in URLs anyway); the client
# secret and refresh token are encrypted together with Fernet in `secret`.
connections = table(
    "service_connection",
    Column("workspace_id", ForeignKey("workspace.id"), nullable=False),
    Column("service", String(20), nullable=False),
    Column("client_id", String(64), nullable=False),
    Column("secret", Text, nullable=False),
    Column("state", String(20), nullable=False),
    # A safe error code (see integrations/spotify.py), never provider text.
    Column("error", String(40)),
    Column("account_name", String(200)),
    Column("connected_at", DateTime(timezone=True)),
    Column("synced_at", DateTime(timezone=True)),
    created_at(),
    one_of("service", ("spotify",)),
    one_of("state", CONNECTION_STATES),
    UniqueConstraint("workspace_id", "service"),
)
# A single-use, browser-bound "Connect Spotify" authorization.
authorizations = table(
    "service_authorization",
    Column("workspace_id", ForeignKey("workspace.id"), nullable=False),
    Column("state_digest", String(64), nullable=False, unique=True),
    Column("binding_digest", String(64), nullable=False),
    Column("verifier", String, nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
)
# The latest listening signals, already mapped to catalog UUIDs
# (see domains/rotation.Signals). Replaced on every sync.
signals = table(
    "listening_signals",
    Column("workspace_id", ForeignKey("workspace.id"), nullable=False, unique=True),
    Column("synced_at", DateTime(timezone=True), nullable=False),
    Column("data", JSONB, nullable=False),
)
