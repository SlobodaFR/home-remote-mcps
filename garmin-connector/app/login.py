import time
import uuid
from typing import Any

from garminconnect import Garmin
from garminconnect.exceptions import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
)

PENDING_TTL_SECONDS = 10 * 60

# In-memory only: a Garmin() client mid-MFA-handshake, keyed by pendingId.
# The garminconnect lib holds all of the pending-MFA state on the client
# instance itself (cookies, CAS ticket, ...) - there is nothing serializable
# to persist, so this process must stay up between the two login requests.
_pending: dict[str, tuple[Garmin, float]] = {}


def _evict_expired() -> None:
    now = time.monotonic()
    expired = [pid for pid, (_, created_at) in _pending.items() if now - created_at > PENDING_TTL_SECONDS]
    for pid in expired:
        _pending.pop(pid, None)


def start_login(email: str, password: str) -> dict[str, Any]:
    _evict_expired()
    client = Garmin(email, password, return_on_mfa=True)
    try:
        status, _ = client.login()
    except GarminConnectAuthenticationError:
        return {"status": "error", "message": "Identifiants Garmin invalides"}
    except GarminConnectConnectionError as err:
        return {"status": "error", "message": f"Garmin injoignable: {err}"}
    except Exception as err:  # noqa: BLE001 - surfaced to the user, not swallowed
        return {"status": "error", "message": str(err)}

    if status == "needs_mfa":
        pending_id = str(uuid.uuid4())
        _pending[pending_id] = (client, time.monotonic())
        return {"status": "mfa_required", "pendingId": pending_id}

    return {"status": "success", "tokensJson": client.client.dumps()}


def submit_mfa(pending_id: str, code: str) -> dict[str, Any]:
    _evict_expired()
    entry = _pending.pop(pending_id, None)
    if entry is None:
        return {"status": "error", "message": "Tentative de connexion expiree, recommence."}

    client, _ = entry
    try:
        client.resume_login({}, code)
    except GarminConnectAuthenticationError:
        return {"status": "error", "message": "Code MFA invalide"}
    except Exception as err:  # noqa: BLE001
        return {"status": "error", "message": str(err)}

    return {"status": "success", "tokensJson": client.client.dumps()}
