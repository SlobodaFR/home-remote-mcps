import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  GarminDataGateway,
  GarminNotConnectedError,
} from '../../application/mcp/garmin-data-gateway';

interface ToolParam {
  name: string;
  zod: z.ZodType;
}

interface ToolDef {
  method: string;
  description: string;
  params: ToolParam[];
}

/**
 * One entry per allowlisted `garminconnect.Garmin` method (see
 * garmin-connector/app/data.py for the matching Python-side allowlist -
 * the two lists must stay in sync). Generated from the library's verified
 * method signatures rather than hand-written per tool, since the surface
 * is ~130 methods; descriptions are hand-tuned for the commonly-used
 * ones and auto-derived (still accurate, just less polished) for the rest.
 * Params typed `unknown`/JSON-ish (activity/workout payloads) are
 * intentionally permissive - Claude fills them in from the corresponding
 * Garmin Connect JSON shape.
 */
const TOOL_DEFS: ToolDef[] = [
  {
    method: 'get_full_name',
    description: 'Get full name (Garmin Connect: `get_full_name`)',
    params: [],
  },
  {
    method: 'get_unit_system',
    description: 'Get unit system (Garmin Connect: `get_unit_system`)',
    params: [],
  },
  {
    method: 'get_stats',
    description:
      "Get a day's activity stats (steps, calories, HR, stress, body battery, sleep summary) from Garmin Connect",
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_user_summary',
    description:
      'Get the raw daily user summary from Garmin Connect for a date',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_steps_data',
    description: 'Get steps data (Garmin Connect: `get_steps_data`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_floors',
    description: 'Get floors (Garmin Connect: `get_floors`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_daily_steps',
    description: 'Get step counts and step goal for each day in a date range',
    params: [
      { name: 'start', zod: z.string() },
      { name: 'end', zod: z.string() },
    ],
  },
  {
    method: 'get_weekly_steps',
    description: 'Get weekly steps (Garmin Connect: `get_weekly_steps`)',
    params: [
      { name: 'end', zod: z.string() },
      { name: 'weeks', zod: z.number().int().optional() },
    ],
  },
  {
    method: 'get_weekly_stress',
    description: 'Get weekly stress (Garmin Connect: `get_weekly_stress`)',
    params: [
      { name: 'end', zod: z.string() },
      { name: 'weeks', zod: z.number().int().optional() },
    ],
  },
  {
    method: 'get_weekly_intensity_minutes',
    description:
      'Get weekly intensity minutes (Garmin Connect: `get_weekly_intensity_minutes`)',
    params: [
      { name: 'start', zod: z.string() },
      { name: 'end', zod: z.string() },
    ],
  },
  {
    method: 'get_heart_rates',
    description: "Get a day's heart rate data (resting HR, HR zones)",
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_stats_and_body',
    description: 'Get stats and body (Garmin Connect: `get_stats_and_body`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_body_composition',
    description:
      'Get body composition (Garmin Connect: `get_body_composition`)',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string().optional() },
    ],
  },
  {
    method: 'add_body_composition',
    description:
      'Add body composition (Garmin Connect: `add_body_composition`)',
    params: [
      { name: 'timestamp', zod: z.string().optional() },
      { name: 'weight', zod: z.number() },
      { name: 'percent_fat', zod: z.number().optional() },
      { name: 'percent_hydration', zod: z.number().optional() },
      { name: 'visceral_fat_mass', zod: z.number().optional() },
      { name: 'bone_mass', zod: z.number().optional() },
      { name: 'muscle_mass', zod: z.number().optional() },
      { name: 'basal_met', zod: z.number().optional() },
      { name: 'active_met', zod: z.number().optional() },
      { name: 'physique_rating', zod: z.number().optional() },
      { name: 'metabolic_age', zod: z.number().optional() },
      { name: 'visceral_fat_rating', zod: z.number().optional() },
      { name: 'bmi', zod: z.number().optional() },
    ],
  },
  {
    method: 'add_weigh_in',
    description: 'Log a new body weight measurement',
    params: [
      { name: 'weight', zod: z.number() },
      { name: 'unitKey', zod: z.string().optional() },
      { name: 'timestamp', zod: z.string().optional() },
    ],
  },
  {
    method: 'add_weigh_in_with_timestamps',
    description:
      'Add weigh in with timestamps (Garmin Connect: `add_weigh_in_with_timestamps`)',
    params: [
      { name: 'weight', zod: z.number() },
      { name: 'unitKey', zod: z.string().optional() },
      { name: 'dateTimestamp', zod: z.string().optional() },
      { name: 'gmtTimestamp', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_weigh_ins',
    description: 'Get weigh ins (Garmin Connect: `get_weigh_ins`)',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string() },
    ],
  },
  {
    method: 'get_daily_weigh_ins',
    description: 'Get daily weigh ins (Garmin Connect: `get_daily_weigh_ins`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'delete_weigh_in',
    description: 'Delete weigh in (Garmin Connect: `delete_weigh_in`)',
    params: [
      { name: 'weight_pk', zod: z.string() },
      { name: 'cdate', zod: z.string() },
    ],
  },
  {
    method: 'delete_weigh_ins',
    description: 'Delete weigh ins (Garmin Connect: `delete_weigh_ins`)',
    params: [
      { name: 'cdate', zod: z.string() },
      { name: 'delete_all', zod: z.boolean().optional() },
    ],
  },
  {
    method: 'get_body_battery',
    description: 'Get Body Battery (energy level) values for a date range',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_body_battery_events',
    description:
      'Get body battery events (Garmin Connect: `get_body_battery_events`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'set_blood_pressure',
    description: 'Set blood pressure (Garmin Connect: `set_blood_pressure`)',
    params: [
      { name: 'systolic', zod: z.number().int() },
      { name: 'diastolic', zod: z.number().int() },
      { name: 'pulse', zod: z.number().int() },
      { name: 'timestamp', zod: z.string().optional() },
      { name: 'notes', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_blood_pressure',
    description: 'Get blood pressure (Garmin Connect: `get_blood_pressure`)',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string().optional() },
    ],
  },
  {
    method: 'delete_blood_pressure',
    description:
      'Delete blood pressure (Garmin Connect: `delete_blood_pressure`)',
    params: [
      { name: 'version', zod: z.string() },
      { name: 'cdate', zod: z.string() },
    ],
  },
  {
    method: 'get_max_metrics',
    description: 'Get max metrics (Garmin Connect: `get_max_metrics`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_max_metrics_range',
    description:
      'Get max metrics range (Garmin Connect: `get_max_metrics_range`)',
    params: [
      { name: 'start', zod: z.string() },
      { name: 'end', zod: z.string() },
    ],
  },
  {
    method: 'get_functional_threshold_power_range',
    description:
      'Get functional threshold power range (Garmin Connect: `get_functional_threshold_power_range`)',
    params: [
      { name: 'start', zod: z.string() },
      { name: 'end', zod: z.string() },
      { name: 'sport', zod: z.string().optional() },
      { name: 'aggregation', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_lactate_threshold',
    description:
      'Get lactate threshold (Garmin Connect: `get_lactate_threshold`)',
    params: [
      { name: 'latest', zod: z.boolean().optional() },
      { name: 'start_date', zod: z.string().optional() },
      { name: 'end_date', zod: z.string().optional() },
      { name: 'aggregation', zod: z.string().optional() },
    ],
  },
  {
    method: 'add_hydration_data',
    description: 'Add hydration data (Garmin Connect: `add_hydration_data`)',
    params: [
      { name: 'value_in_ml', zod: z.number() },
      { name: 'timestamp', zod: z.string().optional() },
      { name: 'cdate', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_hydration_data',
    description: 'Get hydration data (Garmin Connect: `get_hydration_data`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_respiration_data',
    description:
      'Get respiration data (Garmin Connect: `get_respiration_data`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_spo2_data',
    description: 'Get spo2 data (Garmin Connect: `get_spo2_data`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_intensity_minutes_data',
    description:
      'Get intensity minutes data (Garmin Connect: `get_intensity_minutes_data`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_all_day_stress',
    description: 'Get all day stress (Garmin Connect: `get_all_day_stress`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_all_day_events',
    description: 'Get all day events (Garmin Connect: `get_all_day_events`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_personal_record',
    description: "Get the user's personal records",
    params: [],
  },
  {
    method: 'get_earned_badges',
    description: 'Get earned badges (Garmin Connect: `get_earned_badges`)',
    params: [],
  },
  {
    method: 'get_available_badges',
    description:
      'Get available badges (Garmin Connect: `get_available_badges`)',
    params: [],
  },
  {
    method: 'get_in_progress_badges',
    description:
      'Get in progress badges (Garmin Connect: `get_in_progress_badges`)',
    params: [],
  },
  {
    method: 'get_adhoc_challenges',
    description:
      'Get adhoc challenges (Garmin Connect: `get_adhoc_challenges`)',
    params: [
      { name: 'start', zod: z.number().int() },
      { name: 'limit', zod: z.number().int() },
    ],
  },
  {
    method: 'get_badge_challenges',
    description:
      'Get badge challenges (Garmin Connect: `get_badge_challenges`)',
    params: [
      { name: 'start', zod: z.number().int() },
      { name: 'limit', zod: z.number().int() },
    ],
  },
  {
    method: 'get_available_badge_challenges',
    description:
      'Get available badge challenges (Garmin Connect: `get_available_badge_challenges`)',
    params: [
      { name: 'start', zod: z.number().int() },
      { name: 'limit', zod: z.number().int() },
    ],
  },
  {
    method: 'get_non_completed_badge_challenges',
    description:
      'Get non completed badge challenges (Garmin Connect: `get_non_completed_badge_challenges`)',
    params: [
      { name: 'start', zod: z.number().int() },
      { name: 'limit', zod: z.number().int() },
    ],
  },
  {
    method: 'get_inprogress_virtual_challenges',
    description:
      'Get inprogress virtual challenges (Garmin Connect: `get_inprogress_virtual_challenges`)',
    params: [
      { name: 'start', zod: z.number().int() },
      { name: 'limit', zod: z.number().int() },
    ],
  },
  {
    method: 'get_sleep_data',
    description: "Get a night's sleep data (duration, stages, score)",
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_sleep_daily',
    description: 'Get sleep daily (Garmin Connect: `get_sleep_daily`)',
    params: [
      { name: 'start', zod: z.string() },
      { name: 'end', zod: z.string() },
    ],
  },
  {
    method: 'get_stress_data',
    description: "Get a day's stress level data",
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_lifestyle_logging_data',
    description:
      'Get lifestyle logging data (Garmin Connect: `get_lifestyle_logging_data`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_rhr_day',
    description: 'Get rhr day (Garmin Connect: `get_rhr_day`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_rhr_daily',
    description: 'Get rhr daily (Garmin Connect: `get_rhr_daily`)',
    params: [
      { name: 'start', zod: z.string() },
      { name: 'end', zod: z.string() },
    ],
  },
  {
    method: 'get_calories_daily',
    description: 'Get calories daily (Garmin Connect: `get_calories_daily`)',
    params: [
      { name: 'start', zod: z.string() },
      { name: 'end', zod: z.string() },
    ],
  },
  {
    method: 'get_hrv_data',
    description: "Get a day's heart rate variability (HRV) data",
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_hrv_data_range',
    description: 'Get hrv data range (Garmin Connect: `get_hrv_data_range`)',
    params: [
      { name: 'start', zod: z.string() },
      { name: 'end', zod: z.string() },
    ],
  },
  {
    method: 'get_training_readiness',
    description:
      "Get a day's training readiness score and contributing factors",
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_morning_training_readiness',
    description:
      'Get morning training readiness (Garmin Connect: `get_morning_training_readiness`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_endurance_score',
    description: 'Get endurance score (Garmin Connect: `get_endurance_score`)',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_running_tolerance',
    description:
      'Get running tolerance (Garmin Connect: `get_running_tolerance`)',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string() },
      { name: 'aggregation', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_race_predictions',
    description:
      'Get race predictions (Garmin Connect: `get_race_predictions`)',
    params: [
      { name: 'startdate', zod: z.string().optional() },
      { name: 'enddate', zod: z.string().optional() },
      { name: '_type', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_training_status',
    description:
      "Get a day's training status (e.g. productive, peaking, detraining)",
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_fitnessage_data',
    description: 'Get fitnessage data (Garmin Connect: `get_fitnessage_data`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_hill_score',
    description: 'Get hill score (Garmin Connect: `get_hill_score`)',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_devices',
    description: 'List Garmin devices linked to this account',
    params: [],
  },
  {
    method: 'get_device_settings',
    description: 'Get device settings (Garmin Connect: `get_device_settings`)',
    params: [{ name: 'device_id', zod: z.string() }],
  },
  {
    method: 'get_primary_training_device',
    description:
      'Get primary training device (Garmin Connect: `get_primary_training_device`)',
    params: [],
  },
  {
    method: 'get_device_solar_data',
    description:
      'Get device solar data (Garmin Connect: `get_device_solar_data`)',
    params: [
      { name: 'device_id', zod: z.string() },
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_device_alarms',
    description: 'Get device alarms (Garmin Connect: `get_device_alarms`)',
    params: [],
  },
  {
    method: 'get_device_last_used',
    description:
      'Get device last used (Garmin Connect: `get_device_last_used`)',
    params: [],
  },
  {
    method: 'count_activities',
    description: 'Count activities (Garmin Connect: `count_activities`)',
    params: [],
  },
  {
    method: 'get_activities',
    description:
      'List recent activities (runs, rides, workouts...), most recent first',
    params: [
      { name: 'start', zod: z.number().int().optional() },
      { name: 'limit', zod: z.number().int().optional() },
      { name: 'activitytype', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_activities_fordate',
    description:
      'Get activities fordate (Garmin Connect: `get_activities_fordate`)',
    params: [{ name: 'fordate', zod: z.string() }],
  },
  {
    method: 'set_activity_name',
    description: 'Set activity name (Garmin Connect: `set_activity_name`)',
    params: [
      { name: 'activity_id', zod: z.string() },
      { name: 'title', zod: z.string() },
    ],
  },
  {
    method: 'set_activity_type',
    description: 'Set activity type (Garmin Connect: `set_activity_type`)',
    params: [
      { name: 'activity_id', zod: z.string() },
      { name: 'type_id', zod: z.number().int() },
      { name: 'type_key', zod: z.string() },
      { name: 'parent_type_id', zod: z.number().int() },
    ],
  },
  {
    method: 'set_activity_description',
    description:
      'Set activity description (Garmin Connect: `set_activity_description`)',
    params: [
      { name: 'activity_id', zod: z.string() },
      { name: 'description', zod: z.string() },
    ],
  },
  {
    method: 'create_manual_activity_from_json',
    description:
      'Create an activity from a full raw Garmin activity JSON payload (advanced/escape hatch)',
    params: [{ name: 'payload', zod: z.record(z.string(), z.unknown()) }],
  },
  {
    method: 'create_manual_activity',
    description:
      'Create a simple manually-logged activity (no GPS/sensor data)',
    params: [
      { name: 'start_datetime', zod: z.string() },
      { name: 'time_zone', zod: z.string() },
      { name: 'type_key', zod: z.string() },
      { name: 'distance_km', zod: z.number() },
      { name: 'duration_min', zod: z.number().int() },
      { name: 'activity_name', zod: z.string() },
    ],
  },
  {
    method: 'get_last_activity',
    description: 'Get last activity (Garmin Connect: `get_last_activity`)',
    params: [],
  },
  {
    method: 'delete_activity',
    description: 'Permanently delete an activity',
    params: [{ name: 'activity_id', zod: z.string() }],
  },
  {
    method: 'get_activities_by_date',
    description:
      'Get activities by date (Garmin Connect: `get_activities_by_date`)',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string().optional() },
      { name: 'activitytype', zod: z.string().optional() },
      { name: 'sortorder', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_progress_summary_between_dates',
    description:
      'Get progress summary between dates (Garmin Connect: `get_progress_summary_between_dates`)',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string() },
      { name: 'metric', zod: z.string().optional() },
      { name: 'groupbyactivities', zod: z.boolean().optional() },
    ],
  },
  {
    method: 'get_activity_types',
    description: 'Get activity types (Garmin Connect: `get_activity_types`)',
    params: [],
  },
  {
    method: 'get_goals',
    description: "List the user's goals",
    params: [
      { name: 'status', zod: z.string().optional() },
      { name: 'start', zod: z.number().int().optional() },
      { name: 'limit', zod: z.number().int().optional() },
    ],
  },
  {
    method: 'get_gear',
    description: 'List gear (shoes, bikes...) registered to the user',
    params: [{ name: 'userProfileNumber', zod: z.string() }],
  },
  {
    method: 'get_gear_stats',
    description: 'Get gear stats (Garmin Connect: `get_gear_stats`)',
    params: [{ name: 'gearUUID', zod: z.string() }],
  },
  {
    method: 'get_gear_defaults',
    description: 'Get gear defaults (Garmin Connect: `get_gear_defaults`)',
    params: [{ name: 'userProfileNumber', zod: z.string() }],
  },
  {
    method: 'set_gear_default',
    description: 'Set gear default (Garmin Connect: `set_gear_default`)',
    params: [
      { name: 'activityType', zod: z.string() },
      { name: 'gearUUID', zod: z.string() },
      { name: 'defaultGear', zod: z.boolean().optional() },
    ],
  },
  {
    method: 'get_activity_splits',
    description: 'Get activity splits (Garmin Connect: `get_activity_splits`)',
    params: [{ name: 'activity_id', zod: z.string() }],
  },
  {
    method: 'get_activity_typed_splits',
    description:
      'Get activity typed splits (Garmin Connect: `get_activity_typed_splits`)',
    params: [{ name: 'activity_id', zod: z.string() }],
  },
  {
    method: 'get_activity_split_summaries',
    description:
      'Get activity split summaries (Garmin Connect: `get_activity_split_summaries`)',
    params: [{ name: 'activity_id', zod: z.string() }],
  },
  {
    method: 'get_activity_weather',
    description:
      'Get activity weather (Garmin Connect: `get_activity_weather`)',
    params: [{ name: 'activity_id', zod: z.string() }],
  },
  {
    method: 'get_activity_hr_in_timezones',
    description:
      'Get activity hr in timezones (Garmin Connect: `get_activity_hr_in_timezones`)',
    params: [{ name: 'activity_id', zod: z.string() }],
  },
  {
    method: 'get_activity_power_in_timezones',
    description:
      'Get activity power in timezones (Garmin Connect: `get_activity_power_in_timezones`)',
    params: [{ name: 'activity_id', zod: z.string() }],
  },
  {
    method: 'get_cycling_ftp',
    description: 'Get cycling ftp (Garmin Connect: `get_cycling_ftp`)',
    params: [],
  },
  {
    method: 'get_heart_rate_zones',
    description:
      'Get heart rate zones (Garmin Connect: `get_heart_rate_zones`)',
    params: [],
  },
  {
    method: 'get_power_zones',
    description: 'Get power zones (Garmin Connect: `get_power_zones`)',
    params: [],
  },
  {
    method: 'get_power_zones_for_sport',
    description:
      'Get power zones for sport (Garmin Connect: `get_power_zones_for_sport`)',
    params: [{ name: 'sport', zod: z.string() }],
  },
  {
    method: 'get_activity',
    description: 'Get full details for a single activity by id',
    params: [{ name: 'activity_id', zod: z.string() }],
  },
  {
    method: 'get_activity_details',
    description:
      'Get activity details (Garmin Connect: `get_activity_details`)',
    params: [
      { name: 'activity_id', zod: z.string() },
      { name: 'maxchart', zod: z.number().int().optional() },
      { name: 'maxpoly', zod: z.number().int().optional() },
    ],
  },
  {
    method: 'get_activity_exercise_sets',
    description:
      'Get activity exercise sets (Garmin Connect: `get_activity_exercise_sets`)',
    params: [
      { name: 'activity_id', zod: z.union([z.number().int(), z.string()]) },
    ],
  },
  {
    method: 'set_activity_exercise_sets',
    description:
      'Set activity exercise sets (Garmin Connect: `set_activity_exercise_sets`)',
    params: [
      { name: 'activity_id', zod: z.union([z.number().int(), z.string()]) },
      { name: 'payload', zod: z.record(z.string(), z.unknown()) },
    ],
  },
  {
    method: 'get_activity_gear',
    description: 'Get activity gear (Garmin Connect: `get_activity_gear`)',
    params: [
      { name: 'activity_id', zod: z.union([z.number().int(), z.string()]) },
    ],
  },
  {
    method: 'get_gear_activities',
    description: 'Get gear activities (Garmin Connect: `get_gear_activities`)',
    params: [
      { name: 'gearUUID', zod: z.string() },
      { name: 'limit', zod: z.number().int().optional() },
    ],
  },
  {
    method: 'add_gear_to_activity',
    description:
      'Add gear to activity (Garmin Connect: `add_gear_to_activity`)',
    params: [
      { name: 'gearUUID', zod: z.string() },
      { name: 'activity_id', zod: z.union([z.number().int(), z.string()]) },
    ],
  },
  {
    method: 'remove_gear_from_activity',
    description:
      'Remove gear from activity (Garmin Connect: `remove_gear_from_activity`)',
    params: [
      { name: 'gearUUID', zod: z.string() },
      { name: 'activity_id', zod: z.union([z.number().int(), z.string()]) },
    ],
  },
  {
    method: 'get_user_profile',
    description: 'Get user profile (Garmin Connect: `get_user_profile`)',
    params: [],
  },
  {
    method: 'get_userprofile_settings',
    description:
      'Get userprofile settings (Garmin Connect: `get_userprofile_settings`)',
    params: [],
  },
  {
    method: 'request_reload',
    description: 'Request reload (Garmin Connect: `request_reload`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_workouts',
    description: 'List saved workouts',
    params: [
      { name: 'start', zod: z.number().int().optional() },
      { name: 'limit', zod: z.number().int().optional() },
    ],
  },
  {
    method: 'get_workout_by_id',
    description: 'Get workout by id (Garmin Connect: `get_workout_by_id`)',
    params: [
      { name: 'workout_id', zod: z.union([z.number().int(), z.string()]) },
    ],
  },
  {
    method: 'delete_workout',
    description: 'Permanently delete a workout',
    params: [
      { name: 'workout_id', zod: z.union([z.number().int(), z.string()]) },
    ],
  },
  {
    method: 'upload_workout',
    description: 'Create a new workout from a Garmin workout JSON payload',
    params: [
      {
        name: 'workout_json',
        zod: z.union([
          z.record(z.string(), z.unknown()),
          z.array(z.unknown()),
          z.string(),
        ]),
      },
    ],
  },
  {
    method: 'update_workout',
    description:
      'Replace an existing workout with a new Garmin workout JSON payload',
    params: [
      { name: 'workout_id', zod: z.union([z.number().int(), z.string()]) },
      {
        name: 'workout_json',
        zod: z.union([
          z.record(z.string(), z.unknown()),
          z.array(z.unknown()),
          z.string(),
        ]),
      },
    ],
  },
  {
    method: 'push_workout_to_device',
    description:
      'Push workout to device (Garmin Connect: `push_workout_to_device`)',
    params: [
      {
        name: 'workout_id',
        zod: z.union([z.number().int(), z.string()]).optional(),
      },
      {
        name: 'device_id',
        zod: z.union([z.number().int(), z.string()]).optional(),
      },
    ],
  },
  {
    method: 'get_scheduled_workouts',
    description:
      'Get scheduled workouts (Garmin Connect: `get_scheduled_workouts`)',
    params: [
      { name: 'year', zod: z.union([z.number().int(), z.string()]) },
      { name: 'month', zod: z.union([z.number().int(), z.string()]) },
    ],
  },
  {
    method: 'get_scheduled_workout_by_id',
    description:
      'Get scheduled workout by id (Garmin Connect: `get_scheduled_workout_by_id`)',
    params: [
      {
        name: 'scheduled_workout_id',
        zod: z.union([z.number().int(), z.string()]),
      },
    ],
  },
  {
    method: 'schedule_workout',
    description: 'Schedule a saved workout on a given date',
    params: [
      { name: 'workout_id', zod: z.union([z.number().int(), z.string()]) },
      { name: 'date_str', zod: z.string() },
    ],
  },
  {
    method: 'unschedule_workout',
    description: 'Unschedule workout (Garmin Connect: `unschedule_workout`)',
    params: [
      {
        name: 'scheduled_workout_id',
        zod: z.union([z.number().int(), z.string()]),
      },
    ],
  },
  {
    method: 'get_menstrual_data_for_date',
    description:
      'Get menstrual data for date (Garmin Connect: `get_menstrual_data_for_date`)',
    params: [{ name: 'fordate', zod: z.string() }],
  },
  {
    method: 'get_menstrual_calendar_data',
    description:
      'Get menstrual calendar data (Garmin Connect: `get_menstrual_calendar_data`)',
    params: [
      { name: 'startdate', zod: z.string() },
      { name: 'enddate', zod: z.string() },
    ],
  },
  {
    method: 'get_pregnancy_summary',
    description:
      'Get pregnancy summary (Garmin Connect: `get_pregnancy_summary`)',
    params: [],
  },
  {
    method: 'get_training_plans',
    description: 'Get training plans (Garmin Connect: `get_training_plans`)',
    params: [],
  },
  {
    method: 'get_training_plan_by_id',
    description:
      'Get training plan by id (Garmin Connect: `get_training_plan_by_id`)',
    params: [{ name: 'plan_id', zod: z.union([z.number().int(), z.string()]) }],
  },
  {
    method: 'get_adaptive_training_plan_by_id',
    description:
      'Get adaptive training plan by id (Garmin Connect: `get_adaptive_training_plan_by_id`)',
    params: [{ name: 'plan_id', zod: z.union([z.number().int(), z.string()]) }],
  },
  {
    method: 'get_nutrition_daily_food_log',
    description:
      'Get nutrition daily food log (Garmin Connect: `get_nutrition_daily_food_log`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_nutrition_daily_meals',
    description:
      'Get nutrition daily meals (Garmin Connect: `get_nutrition_daily_meals`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_nutrition_daily_settings',
    description:
      'Get nutrition daily settings (Garmin Connect: `get_nutrition_daily_settings`)',
    params: [{ name: 'cdate', zod: z.string() }],
  },
  {
    method: 'get_golf_summary',
    description: 'Get golf summary (Garmin Connect: `get_golf_summary`)',
    params: [
      { name: 'start', zod: z.number().int().optional() },
      { name: 'limit', zod: z.number().int().optional() },
    ],
  },
  {
    method: 'get_golf_scorecard',
    description: 'Get golf scorecard (Garmin Connect: `get_golf_scorecard`)',
    params: [
      { name: 'scorecard_id', zod: z.union([z.number().int(), z.string()]) },
    ],
  },
  {
    method: 'get_golf_shot_data',
    description: 'Get golf shot data (Garmin Connect: `get_golf_shot_data`)',
    params: [
      { name: 'scorecard_id', zod: z.union([z.number().int(), z.string()]) },
      { name: 'hole_numbers', zod: z.string().optional() },
    ],
  },
  {
    method: 'get_golf_club_stats',
    description: 'Get golf club stats (Garmin Connect: `get_golf_club_stats`)',
    params: [{ name: 'limit', zod: z.number().int().optional() }],
  },
  {
    method: 'get_golf_user_stats',
    description: 'Get golf user stats (Garmin Connect: `get_golf_user_stats`)',
    params: [],
  },
];

function asJsonContent(data: unknown): {
  content: { type: 'text'; text: string }[];
} {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function buildInputSchema(def: ToolDef): z.ZodRawShape {
  return Object.fromEntries(def.params.map((param) => [param.name, param.zod]));
}

/** Registers the full Garmin Connect toolset on a fresh McpServer, scoped to one authenticated user. */
export function registerGarminTools(
  server: McpServer,
  gateway: GarminDataGateway,
  userId: string,
): void {
  for (const def of TOOL_DEFS) {
    server.registerTool(
      `garmin_${def.method}`,
      {
        description: def.description,
        inputSchema: z.object(buildInputSchema(def)),
      },
      async (input: Record<string, unknown>) => {
        try {
          const data = await gateway.run(userId, (connector, tokens) =>
            connector.call(tokens, def.method, input),
          );
          return asJsonContent(data);
        } catch (error) {
          if (error instanceof GarminNotConnectedError) {
            return {
              content: [{ type: 'text' as const, text: error.message }],
              isError: true,
            };
          }
          throw error;
        }
      },
    );
  }

  server.registerTool(
    'garmin_connectapi',
    {
      description:
        'Raw Garmin Connect REST call (GET/PUT/POST/DELETE) for endpoints with no dedicated tool - notably food/nutrition logging, which Garmin Connect only exposes as plain REST endpoints. Path is relative, e.g. "/nutrition-service/meals/2026-08-20".',
      inputSchema: z.object({
        httpMethod: z.enum(['GET', 'PUT', 'POST', 'DELETE']),
        path: z.string(),
        jsonBody: z.unknown().optional(),
        queryParams: z.record(z.string(), z.string()).optional(),
      }),
    },
    async ({ httpMethod, path, jsonBody, queryParams }) => {
      try {
        const data = await gateway.run(userId, (connector, tokens) =>
          connector.connectApi(tokens, httpMethod, path, {
            jsonBody,
            queryParams,
          }),
        );
        return asJsonContent(data);
      } catch (error) {
        if (error instanceof GarminNotConnectedError) {
          return {
            content: [{ type: 'text' as const, text: error.message }],
            isError: true,
          };
        }
        throw error;
      }
    },
  );
}
