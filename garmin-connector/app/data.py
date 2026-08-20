import json
from typing import Any, Callable

from fastapi import HTTPException
from garminconnect import Garmin
from garminconnect.exceptions import (
    GarminConnectAuthenticationError,
    GarminConnectConnectionError,
)

# Every method the /call dispatcher is allowed to invoke on a Garmin client.
# Mirrors backend/src/interfaces/mcp/garmin-tools.ts's TOOL_DEFS - keep the
# two in sync. Deliberately excludes: login/resume_login/logout (session
# lifecycle, handled by login.py), query_garmin_graphql (arbitrary GraphQL,
# too open-ended to allowlist safely), connectapi/connectwebproxy/download
# (raw transport - see connectapi_request below instead), and every method
# that returns raw bytes (upload_activity/import_activity/download_activity/
# download_health_snapshot/download_workout - file-shaped, not JSON).
ALLOWED_METHODS = {
    "get_full_name",
    "get_unit_system",
    "get_stats",
    "get_user_summary",
    "get_steps_data",
    "get_floors",
    "get_daily_steps",
    "get_weekly_steps",
    "get_weekly_stress",
    "get_weekly_intensity_minutes",
    "get_heart_rates",
    "get_stats_and_body",
    "get_body_composition",
    "add_body_composition",
    "add_weigh_in",
    "add_weigh_in_with_timestamps",
    "get_weigh_ins",
    "get_daily_weigh_ins",
    "delete_weigh_in",
    "delete_weigh_ins",
    "get_body_battery",
    "get_body_battery_events",
    "set_blood_pressure",
    "get_blood_pressure",
    "delete_blood_pressure",
    "get_max_metrics",
    "get_max_metrics_range",
    "get_functional_threshold_power_range",
    "get_lactate_threshold",
    "add_hydration_data",
    "get_hydration_data",
    "get_respiration_data",
    "get_spo2_data",
    "get_intensity_minutes_data",
    "get_all_day_stress",
    "get_all_day_events",
    "get_personal_record",
    "get_earned_badges",
    "get_available_badges",
    "get_in_progress_badges",
    "get_adhoc_challenges",
    "get_badge_challenges",
    "get_available_badge_challenges",
    "get_non_completed_badge_challenges",
    "get_inprogress_virtual_challenges",
    "get_sleep_data",
    "get_sleep_daily",
    "get_stress_data",
    "get_lifestyle_logging_data",
    "get_rhr_day",
    "get_rhr_daily",
    "get_calories_daily",
    "get_hrv_data",
    "get_hrv_data_range",
    "get_training_readiness",
    "get_morning_training_readiness",
    "get_endurance_score",
    "get_running_tolerance",
    "get_race_predictions",
    "get_training_status",
    "get_fitnessage_data",
    "get_hill_score",
    "get_devices",
    "get_device_settings",
    "get_primary_training_device",
    "get_device_solar_data",
    "get_device_alarms",
    "get_device_last_used",
    "count_activities",
    "get_activities",
    "get_activities_fordate",
    "set_activity_name",
    "set_activity_type",
    "set_activity_description",
    "create_manual_activity_from_json",
    "create_manual_activity",
    "get_last_activity",
    "delete_activity",
    "get_activities_by_date",
    "get_progress_summary_between_dates",
    "get_activity_types",
    "get_goals",
    "get_gear",
    "get_gear_stats",
    "get_gear_defaults",
    "set_gear_default",
    "get_activity_splits",
    "get_activity_typed_splits",
    "get_activity_split_summaries",
    "get_activity_weather",
    "get_activity_hr_in_timezones",
    "get_activity_power_in_timezones",
    "get_cycling_ftp",
    "get_heart_rate_zones",
    "get_power_zones",
    "get_power_zones_for_sport",
    "get_activity",
    "get_activity_details",
    "get_activity_exercise_sets",
    "set_activity_exercise_sets",
    "get_activity_gear",
    "get_gear_activities",
    "add_gear_to_activity",
    "remove_gear_from_activity",
    "get_user_profile",
    "get_userprofile_settings",
    "request_reload",
    "get_workouts",
    "get_workout_by_id",
    "delete_workout",
    "upload_workout",
    "update_workout",
    "push_workout_to_device",
    "get_scheduled_workouts",
    "get_scheduled_workout_by_id",
    "schedule_workout",
    "unschedule_workout",
    "get_menstrual_data_for_date",
    "get_menstrual_calendar_data",
    "get_pregnancy_summary",
    "get_training_plans",
    "get_training_plan_by_id",
    "get_adaptive_training_plan_by_id",
    "get_nutrition_daily_food_log",
    "get_nutrition_daily_meals",
    "get_nutrition_daily_settings",
    "get_golf_summary",
    "get_golf_scorecard",
    "get_golf_shot_data",
    "get_golf_club_stats",
    "get_golf_user_stats",
}


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


def call_method(tokens_json: dict[str, Any], method: str, params: dict[str, Any]) -> dict[str, Any]:
    if method not in ALLOWED_METHODS:
        raise HTTPException(status_code=400, detail=f"Unknown or disallowed Garmin method: {method}")

    def call(client: Garmin) -> Any:
        return getattr(client, method)(**params)

    return with_tokens(tokens_json, call)


def connectapi_request(
    tokens_json: dict[str, Any],
    http_method: str,
    path: str,
    json_body: Any,
    query_params: dict[str, str] | None,
) -> dict[str, Any]:
    """Raw Garmin Connect REST passthrough - mirrors what the garminconnect
    lib itself does internally (Garmin.connectapi() for GET,
    Client.put/post/delete("connectapi", ..., api=True) for writes). Covers
    endpoints with no dedicated high-level method, notably food/nutrition
    logging."""
    method = http_method.upper()
    if method not in ("GET", "PUT", "POST", "DELETE"):
        raise HTTPException(status_code=400, detail=f"Unsupported HTTP method: {http_method}")

    def call(client: Garmin) -> Any:
        if method == "GET":
            return client.connectapi(path, params=query_params or None)
        api_method = getattr(client.client, method.lower())
        return api_method("connectapi", path, json=json_body, api=True)

    return with_tokens(tokens_json, call)
