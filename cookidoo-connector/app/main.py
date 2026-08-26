from typing import Any

from fastapi import Depends, FastAPI
from pydantic import BaseModel

from . import data, login
from .security import require_internal_secret

app = FastAPI(title="cookidoo-connector", docs_url=None, redoc_url=None)


class LoginRequest(BaseModel):
    email: str
    password: str
    countryCode: str
    language: str


class LocalizationDto(BaseModel):
    countryCode: str
    language: str
    url: str


class CookiesOnlyRequest(BaseModel):
    cookiesJson: list[dict[str, Any]]
    localization: LocalizationDto


class CallRequest(CookiesOnlyRequest):
    method: str
    params: dict[str, Any] = {}


@app.post("/login", dependencies=[Depends(require_internal_secret)])
async def post_login(body: LoginRequest) -> dict[str, Any]:
    return await login.start_login(
        body.email, body.password, body.countryCode, body.language
    )


@app.get("/localizations", dependencies=[Depends(require_internal_secret)])
async def get_localizations(
    country: str | None = None, language: str | None = None
) -> list[dict[str, str]]:
    return await login.list_localizations(country, language)


@app.post("/session/check", dependencies=[Depends(require_internal_secret)])
async def post_session_check(body: CookiesOnlyRequest) -> dict[str, Any]:
    return await data.check_session(body.cookiesJson, body.localization.model_dump())


@app.post("/call", dependencies=[Depends(require_internal_secret)])
async def post_call(body: CallRequest) -> dict[str, Any]:
    return await data.call_method(
        body.cookiesJson, body.localization.model_dump(), body.method, body.params
    )


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
