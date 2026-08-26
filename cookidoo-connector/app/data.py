import logging
import os
from datetime import date
from typing import Any, Callable, Coroutine

import aiohttp
from cookidoo_api import (
    Cookidoo,
    CookidooAdditionalItem,
    CookidooConfig,
    CookidooCreateCustomRecipe,
    CookidooCustomAnnotation,
    CookidooIngredientAnnotation,
    CookidooIngredientItem,
    CookidooInstruction,
    CookidooModeAnnotation,
    CookidooStepSettings,
    CookidooTemperatureSetting,
    CookidooTTSAnnotation,
    CookidooUpdateCustomRecipe,
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

_LOGGER = logging.getLogger(__name__)

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
    # Unreleased: only available on the fork commit pinned in
    # requirements.txt (miaucl/cookidoo-api#238, not yet merged upstream).
    "create_custom_recipe",
    "update_custom_recipe",
}

# Params that arrive as JSON primitives but need converting to the type the
# cookidoo-api method actually expects.
_DATE_PARAMS = {"day"}
_INGREDIENT_ITEM_PARAMS = {"ingredient_items"}
_ADDITIONAL_ITEM_PARAMS = {"additional_items"}


def _temperature_setting_from_dict(
    data: dict[str, Any] | None,
) -> CookidooTemperatureSetting | None:
    if data is None:
        return None
    return CookidooTemperatureSetting(value=data["value"], unit=data.get("unit"))


def _annotation_from_dict(data: dict[str, Any]) -> Any:
    # `annotationType` is our own discriminator (the library's annotation
    # dataclasses aren't tagged) - not to be confused with
    # CookidooCustomAnnotation's own `type` field, which is the API's
    # annotation type string (e.g. "INGREDIENT", "TTS").
    kind = data["annotationType"]
    if kind == "ingredient":
        return CookidooIngredientAnnotation(
            slot=data["slot"],
            description=data["description"],
            name=data.get("name"),
        )
    if kind == "tts":
        return CookidooTTSAnnotation(
            slot=data["slot"],
            time=data.get("time"),
            temperature=_temperature_setting_from_dict(data.get("temperature")),
            speed=data.get("speed"),
            direction=data.get("direction"),
            name=data.get("name"),
        )
    if kind == "mode":
        return CookidooModeAnnotation(
            slot=data["slot"],
            mode=data["mode"],
            time=data.get("time"),
            temperature=_temperature_setting_from_dict(data.get("temperature")),
            speed=data.get("speed"),
            direction=data.get("direction"),
            power=data.get("power"),
            accessory=data.get("accessory"),
            name=data.get("name"),
        )
    if kind == "custom":
        return CookidooCustomAnnotation(
            type=data["type"],
            slot=data["slot"],
            data=data.get("data", {}),
            name=data.get("name"),
        )
    raise HTTPException(status_code=400, detail=f"Unknown annotation type: {kind}")


def _instruction_from_item(item: str | dict[str, Any]) -> str | CookidooInstruction:
    if isinstance(item, str):
        return item
    settings = item.get("settings")
    return CookidooInstruction(
        text=item["text"],
        settings=CookidooStepSettings(**settings) if settings else None,
        annotations=[
            _annotation_from_dict(a) for a in item.get("annotations", [])
        ],
    )


def _create_recipe_from_dict(data: dict[str, Any]) -> CookidooCreateCustomRecipe:
    return CookidooCreateCustomRecipe(
        name=data["name"],
        ingredients=data["ingredients"],
        instructions=[_instruction_from_item(i) for i in data["instructions"]],
        serving_size=data["serving_size"],
        total_time=data["total_time"],
        active_time=data["active_time"],
        tools=data.get("tools", []),
        unit_text=data.get("unit_text", "portion"),
        image=data.get("image"),
        hints=data.get("hints", []),
        work_status=data.get("work_status", "PRIVATE"),
        requires_annotations_check=data.get("requires_annotations_check", False),
    )


def _update_recipe_from_dict(data: dict[str, Any]) -> CookidooUpdateCustomRecipe:
    instructions = data.get("instructions")
    return CookidooUpdateCustomRecipe(
        name=data.get("name"),
        ingredients=data.get("ingredients"),
        instructions=(
            [_instruction_from_item(i) for i in instructions]
            if instructions is not None
            else None
        ),
        serving_size=data.get("serving_size"),
        total_time=data.get("total_time"),
        active_time=data.get("active_time"),
        tools=data.get("tools"),
        unit_text=data.get("unit_text"),
        image=data.get("image"),
        image_owned_by_user=data.get("image_owned_by_user"),
        hints=data.get("hints"),
        work_status=data.get("work_status"),
        requires_annotations_check=data.get("requires_annotations_check"),
    )


_RECIPE_PARAM_BUILDERS: dict[str, Callable[[dict[str, Any]], Any]] = {
    "create_custom_recipe": _create_recipe_from_dict,
    "update_custom_recipe": _update_recipe_from_dict,
}


def _prepare_params(method: str, params: dict[str, Any]) -> dict[str, Any]:
    prepared = dict(params)
    for key in _DATE_PARAMS & prepared.keys():
        prepared[key] = date.fromisoformat(prepared[key])
    for key in _INGREDIENT_ITEM_PARAMS & prepared.keys():
        prepared[key] = [CookidooIngredientItem(**item) for item in prepared[key]]
    for key in _ADDITIONAL_ITEM_PARAMS & prepared.keys():
        prepared[key] = [CookidooAdditionalItem(**item) for item in prepared[key]]
    recipe_builder = _RECIPE_PARAM_BUILDERS.get(method)
    if recipe_builder is not None and "recipe" in prepared:
        prepared["recipe"] = recipe_builder(prepared["recipe"])
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
                # `Exception.add_note()` (e.g. create_custom_recipe's
                # orphaned-stub-id note) isn't included in str(err) - surface
                # it explicitly, and log full detail server-side since the
                # library itself only logs the real HTTP status/body at
                # DEBUG (enabled in main.py).
                notes = "; ".join(getattr(err, "__notes__", None) or [])
                detail = f"{err} ({notes})" if notes else str(err)
                _LOGGER.error("Cookidoo call failed: %s", detail, exc_info=err)
                raise HTTPException(
                    status_code=502, detail=f"Cookidoo injoignable: {detail}"
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

    prepared = _prepare_params(method, params)

    async def call(client: Cookidoo) -> Any:
        return await getattr(client, method)(**prepared)

    return await with_cookies(cookies_json, localization, call)
