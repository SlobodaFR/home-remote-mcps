"""Custom recipe create/update, reimplemented independently of
cookidoo_api.Cookidoo.create_custom_recipe()/update_custom_recipe().

Those two methods (added by the still-unmerged, unreviewed
miaucl/cookidoo-api#238) build one combined payload - the full recipe
content plus a few extra keys (cookTime, workStatus, recipeMetadata,
isImageOwnedByUser, and per-instruction top-level time/temperature/speed
duplicating what's already in the instruction's annotations) - and PATCH
it all in a single request. That request is reliably rejected by
Cookidoo's live API with a 400 ("body/tools/0 must be equal to one of the
allowed values"), regardless of the `tools` value sent.

Traffic captured directly from cookidoo.fr's own web app (DevTools
network tab, via a throwaway test recipe) shows the real app never does
this: it saves each field independently as a small, targeted PATCH
containing only the changed keys, and never sends cookTime/workStatus/
recipeMetadata/isImageOwnedByUser, nor top-level time/temperature/speed
on an instruction (only inside its annotations). This module reproduces
that granular flow instead, reusing only the two static helpers from the
library confirmed correct by that same captured traffic
(Cookidoo._process_recipe_steps / Cookidoo._annotation_to_json produce
exactly the instructions/annotations shape the real API accepted).
"""

from http import HTTPStatus
from typing import Any

from cookidoo_api import (
    Cookidoo,
    CookidooCustomAnnotation,
    CookidooIngredientAnnotation,
    CookidooInstruction,
    CookidooModeAnnotation,
    CookidooTemperatureSetting,
    CookidooTTSAnnotation,
)
from cookidoo_api.const import ADD_CUSTOM_RECIPE_PATH, UPDATE_CUSTOM_RECIPE_PATH
from cookidoo_api.exceptions import CookidooParseException


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
    raise ValueError(f"Unknown annotation type: {kind}")


def _instruction_from_item(item: str | dict[str, Any]) -> str | CookidooInstruction:
    if isinstance(item, str):
        return item
    # Deliberately no top-level `settings` - see module docstring. Any
    # timing/temperature/speed must be expressed as an annotation instead.
    return CookidooInstruction(
        text=item["text"],
        annotations=[_annotation_from_dict(a) for a in item.get("annotations", [])],
    )


def _instructions_json(
    steps: list[str | dict[str, Any]], ingredient_texts: list[str]
) -> list[dict[str, Any]]:
    built = [_instruction_from_item(s) for s in steps]
    return Cookidoo._process_recipe_steps(built, ingredient_texts)  # noqa: SLF001


async def _patch_fields(
    cookidoo: Cookidoo, recipe_id: str, fields: dict[str, Any]
) -> None:
    url = cookidoo.api_endpoint / UPDATE_CUSTOM_RECIPE_PATH.format(
        **cookidoo._cfg.localization.__dict__,  # noqa: SLF001
        id=recipe_id,
    )
    await cookidoo._request_json(  # noqa: SLF001
        "patch",
        url,
        "update custom recipe",
        json=fields,
        headers={"CONTENT-TYPE": "application/json"},
        accepted_statuses=(HTTPStatus.OK, HTTPStatus.NO_CONTENT),
    )


async def create_custom_recipe(cookidoo: Cookidoo, recipe: dict[str, Any]) -> Any:
    url_create = cookidoo.api_endpoint / ADD_CUSTOM_RECIPE_PATH.format(
        **cookidoo._cfg.localization.__dict__,  # noqa: SLF001
    )
    created = await cookidoo._request_json(  # noqa: SLF001
        "post",
        url_create,
        "create custom recipe",
        json={"recipeName": recipe["name"]},
        headers={"CONTENT-TYPE": "application/json"},
    )
    recipe_id = created.get("recipeId") if isinstance(created, dict) else None
    if not isinstance(recipe_id, str) or not recipe_id:
        raise CookidooParseException("No recipe ID returned from creation.")

    ingredients: list[str] = recipe["ingredients"]

    await _patch_fields(
        cookidoo,
        recipe_id,
        {
            "totalTime": recipe["total_time"],
            "prepTime": recipe["active_time"],
            "yield": {
                "value": recipe["serving_size"],
                "unitText": recipe.get("unit_text") or "portion",
            },
        },
    )
    # See _create_recipe_from_dict's historical note: Cookidoo rejects
    # some machine codes depending on the account's actual registered
    # device, so default to the one confirmed to work for this account
    # rather than leaving `tools` unset.
    await _patch_fields(
        cookidoo, recipe_id, {"tools": recipe.get("tools") or ["TM6"]}
    )
    await _patch_fields(
        cookidoo,
        recipe_id,
        {"ingredients": [{"type": "INGREDIENT", "text": i} for i in ingredients]},
    )
    await _patch_fields(
        cookidoo,
        recipe_id,
        {"instructions": _instructions_json(recipe["instructions"], ingredients)},
    )
    hints = recipe.get("hints")
    if hints:
        await _patch_fields(cookidoo, recipe_id, {"hints": "\n".join(hints)})

    return await cookidoo.get_custom_recipe(recipe_id)


async def update_custom_recipe(
    cookidoo: Cookidoo, recipe_id: str, recipe: dict[str, Any]
) -> Any:
    if recipe.get("name") is not None:
        await _patch_fields(cookidoo, recipe_id, {"name": recipe["name"]})

    needs_times = (
        recipe.get("total_time") is not None
        or recipe.get("active_time") is not None
        or recipe.get("serving_size") is not None
        or recipe.get("unit_text") is not None
    )
    needs_existing = needs_times or (
        recipe.get("instructions") is not None and recipe.get("ingredients") is None
    )
    existing = await cookidoo.get_custom_recipe(recipe_id) if needs_existing else None

    if needs_times:
        await _patch_fields(
            cookidoo,
            recipe_id,
            {
                "totalTime": recipe.get("total_time", existing.total_time),
                "prepTime": recipe.get("active_time", existing.active_time),
                "yield": {
                    "value": recipe.get("serving_size", existing.serving_size),
                    "unitText": recipe.get("unit_text") or existing.unit_text,
                },
            },
        )
    if recipe.get("tools") is not None:
        await _patch_fields(cookidoo, recipe_id, {"tools": recipe["tools"]})
    if recipe.get("ingredients") is not None:
        await _patch_fields(
            cookidoo,
            recipe_id,
            {
                "ingredients": [
                    {"type": "INGREDIENT", "text": i} for i in recipe["ingredients"]
                ]
            },
        )
    if recipe.get("instructions") is not None:
        ingredient_texts = recipe.get("ingredients")
        if ingredient_texts is None:
            ingredient_texts = existing.ingredients
        await _patch_fields(
            cookidoo,
            recipe_id,
            {
                "instructions": _instructions_json(
                    recipe["instructions"], ingredient_texts
                )
            },
        )
    if recipe.get("hints") is not None:
        await _patch_fields(cookidoo, recipe_id, {"hints": "\n".join(recipe["hints"])})

    return await cookidoo.get_custom_recipe(recipe_id)
