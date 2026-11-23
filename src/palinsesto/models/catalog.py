"""The Workspace's own catalog: artists, albums and their service links."""

from sqlalchemy import (
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)

from palinsesto.domains.rotation import GENRES
from palinsesto.models.accounts import created_at, table

SERVICES = ("spotify", "apple", "tidal", "bandcamp")
MATCHED_BY = ("import", "upc", "search", "manual")


def one_of(column, values):
    return CheckConstraint(f"{column} IN ({', '.join(repr(v) for v in values)})")


artists = table(
    "artist",
    Column("workspace_id", ForeignKey("workspace.id"), nullable=False, index=True),
    Column("name", String(300), nullable=False),
    created_at(),
)
albums = table(
    "album",
    Column("workspace_id", ForeignKey("workspace.id"), nullable=False, index=True),
    Column("title", String(500), nullable=False),
    Column("released", Date, nullable=False),
    Column("label", String(300)),
    Column("tracks", Integer, nullable=False),
    Column("seconds", Integer, nullable=False),
    Column("genre", String(20), nullable=False),
    Column("upc", String(20)),
    Column("image_url", String(500)),
    Column("note", Text, nullable=False, server_default=""),
    created_at(),
    one_of("genre", GENRES),
    CheckConstraint("seconds > 0 AND tracks > 0"),
)
album_artists = table(
    "album_artist",
    Column("album_id", ForeignKey("album.id", ondelete="CASCADE"), nullable=False),
    Column("artist_id", ForeignKey("artist.id"), nullable=False),
    Column("position", Integer, nullable=False),
    UniqueConstraint("album_id", "artist_id"),
)
# A service link is a child of a catalog record. Weeks and verdicts point at
# catalog records, never at a service's identifier.
service_links = table(
    "service_link",
    Column("workspace_id", ForeignKey("workspace.id"), nullable=False),
    Column("album_id", ForeignKey("album.id", ondelete="CASCADE")),
    Column("artist_id", ForeignKey("artist.id", ondelete="CASCADE")),
    Column("service", String(20), nullable=False),
    Column("ref", String(500), nullable=False),
    Column("matched_by", String(20), nullable=False),
    one_of("service", SERVICES),
    one_of("matched_by", MATCHED_BY),
    CheckConstraint("(album_id IS NULL) <> (artist_id IS NULL)"),
    UniqueConstraint("album_id", "service"),
    UniqueConstraint("artist_id", "service"),
)
Index(
    "one_record_per_service_ref",
    service_links.c.workspace_id,
    service_links.c.service,
    service_links.c.ref,
    unique=True,
)
