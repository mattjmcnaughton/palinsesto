"""Operator-only provisioning of an admitted identity; not public registration.

Creates the User for an exact OIDC issuer and subject and the Workspace they own.
Run it in a trusted terminal with the migration owner's DATABASE_URL.
"""

import argparse
import asyncio
import json
from zoneinfo import ZoneInfo

from sqlalchemy import select

from palinsesto.db import async_session, engine
from palinsesto.models.accounts import workspaces
from palinsesto.services.browser_auth import provision


async def bootstrap(args):
    ZoneInfo(args.time_zone)
    async with async_session() as session, session.begin():
        user = await provision(
            session,
            args.issuer,
            args.subject,
            name=args.workspace,
            time_zone=args.time_zone,
        )
        workspace = await session.scalar(
            select(workspaces.c.uuid).where(workspaces.c.owner_id == user)
        )
    await engine.dispose()
    print(json.dumps({"workspace_id": str(workspace)}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("issuer", "subject"):
        parser.add_argument(f"--{name}", required=True)
    parser.add_argument("--workspace", default="My desk")
    parser.add_argument("--time-zone", default="America/New_York")
    asyncio.run(bootstrap(parser.parse_args()))
