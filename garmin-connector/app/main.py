from typing import Any

from fastapi import Depends, FastAPI
from pydantic import BaseModel

from . import data, login
from .security import require_internal_secret

app = FastAPI(title="garmin-connector", docs_url=None, redoc_url=None)


class LoginRequest(BaseModel):
    email: str
    password: str


class MfaRequest(BaseModel):
    code: str


class TokensOnlyRequest(BaseModel):
    tokensJson: dict[str, Any]


class DateRequest(TokensOnlyRequest):
    date: str


class ActivitiesRequest(TokensOnlyRequest):
    limit: int = 10


@app.post("/login", dependencies=[Depends(require_internal_secret)])
def post_login(body: LoginRequest) -> dict[str, Any]:
    return login.start_login(body.email, body.password)


@app.post("/login/{pending_id}/mfa", dependencies=[Depends(require_internal_secret)])
def post_login_mfa(pending_id: str, body: MfaRequest) -> dict[str, Any]:
    return login.submit_mfa(pending_id, body.code)


@app.post("/session/check", dependencies=[Depends(require_internal_secret)])
def post_session_check(body: TokensOnlyRequest) -> dict[str, Any]:
    return data.check_session(body.tokensJson)


@app.post("/data/steps", dependencies=[Depends(require_internal_secret)])
def post_steps(body: DateRequest) -> dict[str, Any]:
    return data.get_daily_steps(body.tokensJson, body.date)


@app.post("/data/sleep", dependencies=[Depends(require_internal_secret)])
def post_sleep(body: DateRequest) -> dict[str, Any]:
    return data.get_sleep(body.tokensJson, body.date)


@app.post("/data/heart-rate", dependencies=[Depends(require_internal_secret)])
def post_heart_rate(body: DateRequest) -> dict[str, Any]:
    return data.get_heart_rate(body.tokensJson, body.date)


@app.post("/data/body-battery", dependencies=[Depends(require_internal_secret)])
def post_body_battery(body: DateRequest) -> dict[str, Any]:
    return data.get_body_battery(body.tokensJson, body.date)


@app.post("/data/stress", dependencies=[Depends(require_internal_secret)])
def post_stress(body: DateRequest) -> dict[str, Any]:
    return data.get_stress(body.tokensJson, body.date)


@app.post("/data/activities", dependencies=[Depends(require_internal_secret)])
def post_activities(body: ActivitiesRequest) -> dict[str, Any]:
    return data.get_activities(body.tokensJson, body.limit)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
