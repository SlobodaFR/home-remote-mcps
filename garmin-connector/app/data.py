import json
from typing import Any, Callable

from fastapi import HTTPException
from garminconnect import Garmin
from garminconnect.exceptions import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
)


def _client_from_tokens(tokens_json: dict[str, Any]) -> Garmin:
    client = Garmin()
    client.client.loads(json.dumps(tokens_json))
    return client


def with_tokens(tokens_json: dict[str, Any], call: Callable[[Garmin], Any]) -> dict[str, Any]:
    """Runs `call` against a client restored from `tokens_json`. The lib
    auto-refreshes the DI token before an about-to-expire call, so the
    tokens after the call may differ from the ones passed in - only then is
    `refreshedTokensJson` included, so the backend re-encrypts and persists
    the rotated token instead of letting it go stale."""
    client = _client_from_tokens(tokens_json)
    before = client.client.dumps()
    try:
        result = call(client)
    except GarminConnectAuthenticationError as err:
        raise HTTPException(status_code=401, detail=f"Session Garmin expiree: {err}") from err
    except GarminConnectConnectionError as err:
        raise HTTPException(status_code=502, detail=f"Garmin injoignable: {err}") from err
    after = client.client.dumps()

    body: dict[str, Any] = {"data": result}
    if after != before:
        body["refreshedTokensJson"] = after
    return body


def check_session(tokens_json: dict[str, Any]) -> dict[str, Any]:
    def call(client: Garmin) -> dict[str, Any]:
        client.get_full_name()
        return {"valid": True}

    try:
        return with_tokens(tokens_json, call)
    except HTTPException as err:
        if err.status_code == 401:
            return {"data": {"valid": False}}
        raise


def get_daily_steps(tokens_json: dict[str, Any], date: str) -> dict[str, Any]:
    def call(client: Garmin) -> Any:
        rows = client.get_daily_steps(date, date)
        return rows[0] if rows else {}

    return with_tokens(tokens_json, call)


def get_sleep(tokens_json: dict[str, Any], date: str) -> dict[str, Any]:
    return with_tokens(tokens_json, lambda client: client.get_sleep_data(date))


def get_heart_rate(tokens_json: dict[str, Any], date: str) -> dict[str, Any]:
    return with_tokens(tokens_json, lambda client: client.get_heart_rates(date))


def get_body_battery(tokens_json: dict[str, Any], date: str) -> dict[str, Any]:
    def call(client: Garmin) -> Any:
        rows = client.get_body_battery(date, date)
        return rows[0] if rows else {}

    return with_tokens(tokens_json, call)


def get_stress(tokens_json: dict[str, Any], date: str) -> dict[str, Any]:
    return with_tokens(tokens_json, lambda client: client.get_stress_data(date))


def get_activities(tokens_json: dict[str, Any], limit: int) -> dict[str, Any]:
    return with_tokens(tokens_json, lambda client: client.get_activities(0, limit))
