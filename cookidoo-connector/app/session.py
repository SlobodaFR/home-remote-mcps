import json
import os
import tempfile
from typing import Any

from cookidoo_api import CookidooLocalizationConfig

# cookidoo-api's Cookidoo.save_cookies()/load_cookies() only take a
# filesystem path (no in-memory API) - round-tripping through a short-lived
# tempfile lets this service reuse the library's own cookie (de)serialization
# instead of re-implementing it, so it stays correct if the library's cookie
# format ever changes.


def new_cookie_tempfile_path() -> str:
    fd, path = tempfile.mkstemp(suffix=".json")
    os.close(fd)
    return path


def write_cookies(path: str, cookies_json: list[dict[str, Any]]) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(cookies_json, f)


def read_cookies(path: str) -> list[dict[str, Any]]:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def localization_to_dict(loc: CookidooLocalizationConfig) -> dict[str, str]:
    return {"countryCode": loc.country_code, "language": loc.language, "url": loc.url}


def localization_from_dict(data: dict[str, Any]) -> CookidooLocalizationConfig:
    return CookidooLocalizationConfig(
        country_code=data["countryCode"],
        language=data["language"],
        url=data["url"],
    )
