import os

from fastapi import Header, HTTPException

INTERNAL_SECRET = os.environ["COOKIDOO_CONNECTOR_SECRET"]


async def require_internal_secret(x_internal_secret: str = Header(default="")) -> None:
    """Only the home-remote-mcps backend, on the internal docker network,
    should ever reach this service. It is never exposed publicly."""
    if x_internal_secret != INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="Invalid internal secret")
