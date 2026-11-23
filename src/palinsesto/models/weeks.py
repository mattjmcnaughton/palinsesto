"""Weeks on the desk and in the log book, with their log entries and verdicts."""

from sqlalchemy import (
    ARRAY,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB

from palinsesto.domains.rotation import LANES, VERDICTS
from palinsesto.models.accounts import created_at, table
from palinsesto.models.catalog import one_of

weeks = table(
    "week",
    Column("workspace_id", ForeignKey("workspace.id"), nullable=False),
    # Always a Monday.
    Column("starts_on", Date, nullable=False),
    Column("closed_at", DateTime(timezone=True)),
    # The last export: {at, service, playlist_ref, album_ids}.
    Column("sent", JSONB),
    # Album UUIDs skipped for this week only.
    Column("skipped", ARRAY(Uuid), nullable=False, server_default="{}"),
    created_at(),
    UniqueConstraint("workspace_id", "starts_on"),
)
# Exactly one week is on the desk at a time.
Index(
    "one_open_week",
    weeks.c.workspace_id,
    unique=True,
    postgresql_where=weeks.c.closed_at.is_(None),
)
log_entries = table(
    "log_entry",
    Column("week_id", ForeignKey("week.id", ondelete="CASCADE"), nullable=False),
    Column("album_id", ForeignKey("album.id"), nullable=False),
    Column("position", Integer, nullable=False),
    Column("lane", String(20), nullable=False),
    Column("reason", Text, nullable=False),
    Column("verdict", String(20)),
    Column("note", Text, nullable=False, server_default=""),
    one_of("lane", LANES),
    one_of("verdict", VERDICTS),
    UniqueConstraint("week_id", "album_id"),
)
