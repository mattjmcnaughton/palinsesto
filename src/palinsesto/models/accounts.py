"""Users, their single-owner Workspaces, and browser credentials."""

from uuid import uuid4

from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Identity,
    String,
    Table,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB

from palinsesto.db import Base


def identity():
    return [
        Column("id", BigInteger, Identity(), primary_key=True),
        Column("uuid", Uuid, default=uuid4, nullable=False, unique=True),
    ]


def table(name, *columns):
    return Table(name, Base.metadata, *identity(), *columns)


def created_at():
    return Column(
        "created_at", DateTime(timezone=True), server_default=func.now(), nullable=False
    )


users = table(
    "app_user",
    Column("issuer", String, nullable=False),
    Column("subject", String, nullable=False),
    created_at(),
    UniqueConstraint("issuer", "subject"),
)
# One Workspace per User, owned by that User alone. Every musical record
# belongs to a Workspace, so sharing later means adding members, not moving rows.
workspaces = table(
    "workspace",
    Column("owner_id", ForeignKey("app_user.id"), nullable=False, unique=True),
    Column("name", String(120), nullable=False),
    Column("time_zone", String, nullable=False),
    # The rotation policy (see domains/rotation.Policy); validated on write.
    Column("policy", JSONB, nullable=False),
    created_at(),
)
sessions = table(
    "browser_session",
    Column("user_id", ForeignKey("app_user.id"), nullable=False),
    Column("digest", String(64), nullable=False, unique=True),
    created_at(),
    Column("expires_at", DateTime(timezone=True), nullable=False),
    Column("revoked_at", DateTime(timezone=True)),
)
login_transactions = table(
    "oidc_login_transaction",
    Column("state_digest", String(64), nullable=False, unique=True),
    Column("binding_digest", String(64), nullable=False),
    Column("nonce", String, nullable=False),
    Column("verifier", String, nullable=False),
    Column("expires_at", DateTime(timezone=True), nullable=False),
)
