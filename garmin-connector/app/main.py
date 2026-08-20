from typing import Any, Literal

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


class CallRequest(TokensOnlyRequest):
    method: str
    params: dict[str, Any] = {}


class ConnectApiRequest(TokensOnlyRequest):
    httpMethod: Literal["GET", "PUT", "POST", "DELETE"]
    path: str
    jsonBody: Any = None
    queryParams: dict[str, str] | None = None


@app.post("/login", dependencies=[Depends(require_internal_secret)])
def post_login(body: LoginRequest) -> dict[str, Any]:
    return login.start_login(body.email, body.password)


@app.post("/login/{pending_id}/mfa", dependencies=[Depends(require_internal_secret)])
def post_login_mfa(pending_id: str, body: MfaRequest) -> dict[str, Any]:
    return login.submit_mfa(pending_id, body.code)


@app.post("/session/check", dependencies=[Depends(require_internal_secret)])
def post_session_check(body: TokensOnlyRequest) -> dict[str, Any]:
    return data.check_session(body.tokensJson)


@app.post("/call", dependencies=[Depends(require_internal_secret)])
def post_call(body: CallRequest) -> dict[str, Any]:
    return data.call_method(body.tokensJson, body.method, body.params)


@app.post("/connectapi", dependencies=[Depends(require_internal_secret)])
def post_connectapi(body: ConnectApiRequest) -> dict[str, Any]:
    return data.connectapi_request(body.tokensJson, body.httpMethod, body.path, body.jsonBody, body.queryParams)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
