import os
from typing import Any

import aiohttp
from cookidoo_api import Cookidoo, CookidooConfig, get_localization_options
from cookidoo_api.exceptions import (
    CookidooAuthException,
    CookidooConfigException,
    CookidooParseException,
    CookidooRequestException,
)

from .session import (
    localization_to_dict,
    new_cookie_tempfile_path,
    read_cookies,
)


async def list_localizations(
    country: str | None, language: str | None
) -> list[dict[str, str]]:
    options = await get_localization_options(country, language)
    return [localization_to_dict(option) for option in options]


async def start_login(
    email: str, password: str, country_code: str, language: str
) -> dict[str, Any]:
    options = await get_localization_options(country_code, language)
    if not options:
        return {
            "status": "error",
            "message": f"Localisation Cookidoo inconnue: {country_code}/{language}",
        }
    localization = options[0]

    cfg = CookidooConfig(localization=localization, email=email, password=password)
    async with aiohttp.ClientSession(
        cookie_jar=aiohttp.CookieJar(unsafe=True)
    ) as session:
        cookidoo = Cookidoo(session, cfg)
        try:
            await cookidoo.login()
        except CookidooAuthException as err:
            return {"status": "error", "message": f"Identifiants Cookidoo invalides: {err}"}
        except (
            CookidooRequestException,
            CookidooParseException,
            CookidooConfigException,
        ) as err:
            return {"status": "error", "message": f"Cookidoo injoignable: {err}"}

        path = new_cookie_tempfile_path()
        try:
            cookidoo.save_cookies(path)
            cookies_json = read_cookies(path)
        finally:
            os.unlink(path)

    return {
        "status": "success",
        "cookiesJson": cookies_json,
        "localization": localization_to_dict(localization),
    }
