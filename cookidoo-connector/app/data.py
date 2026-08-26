import os
from datetime import date
from typing import Any, Callable, Coroutine

import aiohttp
from cookidoo_api import (
    Cookidoo,
    CookidooAdditionalItem,
    CookidooConfig,
    CookidooIngredientItem,
)
from cookidoo_api.exceptions import (
    CookidooAuthException,
    CookidooConfigException,
    CookidooParseException,
    CookidooRequestException,
)
from fastapi import HTTPException

from .session import (
    localization_from_dict,
    new_cookie_tempfile_path,
    read_cookies,
    write_cookies,
)

# Every method the /call dispatcher is allowed to invoke on a Cookidoo
# client. Mirrors backend/src/interfaces/mcp/cookidoo-tools.ts's TOOL_DEFS -
# keep the two in sync. Deliberately excludes login (session lifecycle,
# handled by login.py) and save_cookies/load_cookies (internal to this
# service, never called with request-supplied paths).
ALLOWED_METHODS = {
    "get_user_info",
    "get_active_subscription",
    "get_recipe_details",
    "search_recipes",
    "get_custom_recipe",
    "list_custom_recipes",
    "add_custom_recipe_from",
    "remove_custom_recipe",
    "get_shopping_list_recipes",
    "get_ingredient_items",
    "add_ingredient_items_for_recipes",
    "remove_ingredient_items_for_recipes",
    "edit_ingredient_items_ownership",
    "add_ingredient_items_for_custom_recipes",
    "remove_ingredient_items_for_custom_recipes",
    "get_additional_items",
    "add_additional_items",
    "edit_additional_items",
    "edit_additional_items_ownership",
    "remove_additional_items",
    "clear_shopping_list",
    "count_managed_collections",
    "get_managed_collections",
    "add_managed_collection",
    "remove_managed_collection",
    "count_custom_collections",
    "get_custom_collections",
    "add_custom_collection",
    "remove_custom_collection",
    "add_recipes_to_custom_collection",
    "remove_recipe_from_custom_collection",
    "get_recipes_in_calendar_week",
    "add_recipes_to_calendar",
    "remove_recipe_from_calendar",
    "add_custom_recipes_to_calendar",
    "remove_custom_recipe_from_calendar",
}

# Params that arrive as JSON primitives but need converting to the type the
# cookidoo-api method actually expects.
_DATE_PARAMS = {"day"}
_INGREDIENT_ITEM_PARAMS = {"ingredient_items"}
_ADDITIONAL_ITEM_PARAMS = {"additional_items"}


def _prepare_params(params: dict[str, Any]) -> dict[str, Any]:
    prepared = dict(params)
    for key in _DATE_PARAMS & prepared.keys():
        prepared[key] = date.fromisoformat(prepared[key])
    for key in _INGREDIENT_ITEM_PARAMS & prepared.keys():
        prepared[key] = [CookidooIngredientItem(**item) for item in prepared[key]]
    for key in _ADDITIONAL_ITEM_PARAMS & prepared.keys():
        prepared[key] = [CookidooAdditionalItem(**item) for item in prepared[key]]
    return prepared


async def with_cookies(
    cookies_json: list[dict[str, Any]],
    localization: dict[str, Any],
    call: Callable[[Cookidoo], Coroutine[Any, Any, Any]],
) -> dict[str, Any]:
    cfg = CookidooConfig(localization=localization_from_dict(localization))
    async with aiohttp.ClientSession(
        cookie_jar=aiohttp.CookieJar(unsafe=True)
    ) as session:
        cookidoo = Cookidoo(session, cfg)
        path = new_cookie_tempfile_path()
        try:
            write_cookies(path, cookies_json)
            cookidoo.load_cookies(path)

            try:
                result = await call(cookidoo)
            except CookidooAuthException as err:
                raise HTTPException(
                    status_code=401, detail=f"Session Cookidoo expiree: {err}"
                ) from err
            except (
                CookidooRequestException,
                CookidooParseException,
                CookidooConfigException,
            ) as err:
                raise HTTPException(
                    status_code=502, detail=f"Cookidoo injoignable: {err}"
                ) from err

            cookidoo.save_cookies(path)
            after = read_cookies(path)
        finally:
            os.unlink(path)

    body: dict[str, Any] = {"data": result}
    if after != cookies_json:
        body["refreshedCookiesJson"] = after
    return body


async def check_session(
    cookies_json: list[dict[str, Any]], localization: dict[str, Any]
) -> dict[str, Any]:
    async def call(client: Cookidoo) -> dict[str, Any]:
        await client.get_user_info()
        return {"valid": True}

    try:
        return await with_cookies(cookies_json, localization, call)
    except HTTPException as err:
        if err.status_code == 401:
            return {"data": {"valid": False}}
        raise


async def call_method(
    cookies_json: list[dict[str, Any]],
    localization: dict[str, Any],
    method: str,
    params: dict[str, Any],
) -> dict[str, Any]:
    if method not in ALLOWED_METHODS:
        raise HTTPException(
            status_code=400, detail=f"Unknown or disallowed Cookidoo method: {method}"
        )

    prepared = _prepare_params(params)

    async def call(client: Cookidoo) -> Any:
        return await getattr(client, method)(**prepared)

    return await with_cookies(cookies_json, localization, call)
