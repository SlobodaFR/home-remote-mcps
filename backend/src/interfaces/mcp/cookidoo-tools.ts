import { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {
  CookidooDataGateway,
  CookidooNotConnectedError,
} from '../../application/mcp/cookidoo-data-gateway';

interface ToolParam {
  name: string;
  zod: z.ZodType;
}

interface ToolDef {
  method: string;
  description: string;
  params: ToolParam[];
}

const ownedItem = z.object({
  id: z.string(),
  name: z.string(),
  is_owned: z.boolean(),
});

const ingredientItem = ownedItem.extend({ description: z.string() });

/**
 * One entry per allowlisted `cookidoo_api.Cookidoo` method (see
 * cookidoo-connector/app/data.py for the matching Python-side allowlist -
 * the two lists must stay in sync). Param names match the library's
 * Python kwargs verbatim (including its inconsistent casing, e.g.
 * `recipeId`/`servingSize` on `add_custom_recipe_from`) so `call()` can
 * forward the input object straight through as `**params`.
 */
const TOOL_DEFS: ToolDef[] = [
  {
    method: 'get_user_info',
    description: "Get the logged-in user's Cookidoo profile info",
    params: [],
  },
  {
    method: 'get_active_subscription',
    description:
      "Get the user's active Cookidoo subscription, if any (plan, renewal date)",
    params: [],
  },
  {
    method: 'get_recipe_details',
    description:
      'Get full details (ingredients, steps, nutrition) for a Cookidoo recipe by id',
    params: [{ name: 'id', zod: z.string() }],
  },
  {
    method: 'search_recipes',
    description:
      'Search the Cookidoo recipe catalogue by free-text query and/or filters (category, ingredients, difficulty, timing, Thermomix model...)',
    params: [
      { name: 'query', zod: z.string().optional() },
      { name: 'locale', zod: z.string().optional() },
      {
        name: 'accessories',
        zod: z.union([z.string(), z.array(z.string())]).optional(),
      },
      {
        name: 'languages',
        zod: z.union([z.string(), z.array(z.string())]).optional(),
      },
      {
        name: 'categories',
        zod: z.union([z.string(), z.array(z.string())]).optional(),
      },
      {
        name: 'countries',
        zod: z.union([z.string(), z.array(z.string())]).optional(),
      },
      {
        name: 'ingredients',
        zod: z.union([z.string(), z.array(z.string())]).optional(),
      },
      {
        name: 'exclude_ingredients',
        zod: z.union([z.string(), z.array(z.string())]).optional(),
      },
      {
        name: 'tags',
        zod: z.union([z.string(), z.array(z.string())]).optional(),
      },
      {
        name: 'ratings',
        zod: z.union([z.string(), z.array(z.string())]).optional(),
      },
      { name: 'difficulty', zod: z.string().optional() },
      { name: 'preparation_time', zod: z.number().int().optional() },
      { name: 'total_time', zod: z.number().int().optional() },
      { name: 'portions', zod: z.number().int().optional() },
      { name: 'page', zod: z.number().int().optional() },
      { name: 'page_size', zod: z.number().int().optional() },
      {
        name: 'tmv',
        zod: z.union([z.string(), z.array(z.string())]).optional(),
      },
    ],
  },
  {
    method: 'get_custom_recipe',
    description: "Get details of one of the user's custom recipes by id",
    params: [{ name: 'id', zod: z.string() }],
  },
  {
    method: 'list_custom_recipes',
    description: "List the user's custom recipes",
    params: [],
  },
  {
    method: 'add_custom_recipe_from',
    description:
      "Create a custom recipe by cloning a catalogue recipe (by id) with a chosen serving size - the only way Cookidoo lets you add a recipe to the user's own collection",
    params: [
      { name: 'recipeId', zod: z.string() },
      { name: 'servingSize', zod: z.number().int() },
    ],
  },
  {
    method: 'remove_custom_recipe',
    description: "Delete one of the user's custom recipes",
    params: [{ name: 'custom_recipe_id', zod: z.string() }],
  },
  {
    method: 'get_shopping_list_recipes',
    description:
      'List the recipes currently contributing ingredients to the shopping list',
    params: [],
  },
  {
    method: 'get_ingredient_items',
    description: 'Get the shopping list ingredient items',
    params: [],
  },
  {
    method: 'add_ingredient_items_for_recipes',
    description:
      "Add a recipe's ingredients to the shopping list, by recipe id",
    params: [{ name: 'recipe_ids', zod: z.array(z.string()) }],
  },
  {
    method: 'remove_ingredient_items_for_recipes',
    description: "Remove a recipe's ingredients from the shopping list",
    params: [{ name: 'recipe_ids', zod: z.array(z.string()) }],
  },
  {
    method: 'edit_ingredient_items_ownership',
    description:
      'Mark shopping list ingredient items as owned/not-owned (checked off). Pass the full item objects (id, name, is_owned, description) with is_owned updated.',
    params: [{ name: 'ingredient_items', zod: z.array(ingredientItem) }],
  },
  {
    method: 'add_ingredient_items_for_custom_recipes',
    description:
      "Add a custom recipe's ingredients to the shopping list, by custom recipe id",
    params: [{ name: 'recipe_ids', zod: z.array(z.string()) }],
  },
  {
    method: 'remove_ingredient_items_for_custom_recipes',
    description: "Remove a custom recipe's ingredients from the shopping list",
    params: [{ name: 'recipe_ids', zod: z.array(z.string()) }],
  },
  {
    method: 'get_additional_items',
    description:
      'Get the shopping list additional items (manually added, not tied to a recipe)',
    params: [],
  },
  {
    method: 'add_additional_items',
    description:
      'Add free-text additional items to the shopping list, by name (e.g. "paper towels")',
    params: [{ name: 'additional_item_names', zod: z.array(z.string()) }],
  },
  {
    method: 'edit_additional_items',
    description:
      'Edit shopping list additional items (rename, etc). Pass the full item objects (id, name, is_owned) with the fields updated.',
    params: [{ name: 'additional_items', zod: z.array(ownedItem) }],
  },
  {
    method: 'edit_additional_items_ownership',
    description:
      'Mark shopping list additional items as owned/not-owned (checked off). Pass the full item objects (id, name, is_owned) with is_owned updated.',
    params: [{ name: 'additional_items', zod: z.array(ownedItem) }],
  },
  {
    method: 'remove_additional_items',
    description: 'Remove additional items from the shopping list, by id',
    params: [{ name: 'additional_item_ids', zod: z.array(z.string()) }],
  },
  {
    method: 'clear_shopping_list',
    description:
      'Clear the entire shopping list (ingredient items and additional items)',
    params: [],
  },
  {
    method: 'count_managed_collections',
    description:
      "Count the user's managed (official Cookidoo) recipe collections - returns [count, totalPages]",
    params: [],
  },
  {
    method: 'get_managed_collections',
    description: "List the user's managed (official Cookidoo) collections",
    params: [{ name: 'page', zod: z.number().int().optional() }],
  },
  {
    method: 'add_managed_collection',
    description: 'Add an official Cookidoo collection to the user by id',
    params: [{ name: 'managed_collection_id', zod: z.string() }],
  },
  {
    method: 'remove_managed_collection',
    description: "Remove one of the user's managed collections",
    params: [{ name: 'managed_collection_id', zod: z.string() }],
  },
  {
    method: 'count_custom_collections',
    description:
      "Count the user's custom (self-created) recipe collections - returns [count, totalPages]",
    params: [],
  },
  {
    method: 'get_custom_collections',
    description: "List the user's custom (self-created) collections",
    params: [{ name: 'page', zod: z.number().int().optional() }],
  },
  {
    method: 'add_custom_collection',
    description: 'Create a new custom (self-created) recipe collection',
    params: [{ name: 'custom_collection_name', zod: z.string() }],
  },
  {
    method: 'remove_custom_collection',
    description: "Delete one of the user's custom collections",
    params: [{ name: 'custom_collection_id', zod: z.string() }],
  },
  {
    method: 'add_recipes_to_custom_collection',
    description: "Add recipes to one of the user's custom collections",
    params: [
      { name: 'custom_collection_id', zod: z.string() },
      { name: 'recipe_ids', zod: z.array(z.string()) },
    ],
  },
  {
    method: 'remove_recipe_from_custom_collection',
    description: "Remove a recipe from one of the user's custom collections",
    params: [
      { name: 'custom_collection_id', zod: z.string() },
      { name: 'recipe_id', zod: z.string() },
    ],
  },
  {
    method: 'get_recipes_in_calendar_week',
    description:
      'Get the meal-planning calendar for the week containing the given date (YYYY-MM-DD)',
    params: [{ name: 'day', zod: z.string() }],
  },
  {
    method: 'add_recipes_to_calendar',
    description:
      'Schedule recipes onto the meal-planning calendar for a date (YYYY-MM-DD)',
    params: [
      { name: 'day', zod: z.string() },
      { name: 'recipe_ids', zod: z.array(z.string()) },
    ],
  },
  {
    method: 'remove_recipe_from_calendar',
    description:
      'Unschedule a recipe from the meal-planning calendar on a date (YYYY-MM-DD)',
    params: [
      { name: 'day', zod: z.string() },
      { name: 'recipe_id', zod: z.string() },
    ],
  },
  {
    method: 'add_custom_recipes_to_calendar',
    description:
      'Schedule custom recipes onto the meal-planning calendar for a date (YYYY-MM-DD)',
    params: [
      { name: 'day', zod: z.string() },
      { name: 'recipe_ids', zod: z.array(z.string()) },
    ],
  },
  {
    method: 'remove_custom_recipe_from_calendar',
    description:
      'Unschedule a custom recipe from the meal-planning calendar on a date (YYYY-MM-DD)',
    params: [
      { name: 'day', zod: z.string() },
      { name: 'recipe_id', zod: z.string() },
    ],
  },
];

function buildInputSchema(def: ToolDef): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  for (const param of def.params) {
    shape[param.name] = param.zod;
  }
  return shape;
}

function asJsonContent(data: unknown): {
  content: { type: 'text'; text: string }[];
} {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export function registerCookidooTools(
  server: McpServer,
  gateway: CookidooDataGateway,
  userId: string,
): void {
  for (const def of TOOL_DEFS) {
    server.registerTool(
      `cookidoo_${def.method}`,
      {
        description: def.description,
        inputSchema: z.object(buildInputSchema(def)),
      },
      async (input: Record<string, unknown>) => {
        try {
          const data = await gateway.run(userId, (connector, payload) =>
            connector.call(
              JSON.stringify(payload.cookiesJson),
              payload.localization,
              def.method,
              input,
            ),
          );
          return asJsonContent(data);
        } catch (error) {
          if (error instanceof CookidooNotConnectedError) {
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
}
