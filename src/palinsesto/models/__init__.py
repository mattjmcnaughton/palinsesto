"""Import every table so Alembic sees the full metadata."""

from palinsesto.models import accounts, catalog, connections, weeks  # noqa: F401
