import Anthropic from "@anthropic-ai/sdk";
import { searchUsdaFood, usdaEnabled, type FdcCandidate } from "@/lib/usdaFdc";

export interface ParsedMealItem {
  name: string;
  quantity: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface ParsedMeal {
  items: ParsedMealItem[];
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface PastMeal {
  rawText: string;
  loggedAt: Date;
  items: ParsedMealItem[];
  /** Whether the user manually corrected this entry's numbers after the AI logged it. */
  verified: boolean;
}

const LOG_TOOL_NAME = "log_meal_nutrition";
const SEARCH_TOOL_NAME = "search_usda_food";
const MAX_REFERENCE_MEALS = 60;
// Upper bound on search_usda_food round-trips per meal before we force a
// final answer, so a confused model can't loop indefinitely on our dime.
const MAX_TOOL_ROUNDS = 5;

// How far an item's stated calories may drift from its Atwater-derived value
// (4 kcal/g protein, 4 kcal/g carbs, 9 kcal/g fat) before we don't trust it.
const ATWATER_RELATIVE_TOLERANCE = 0.15;
const ATWATER_ABSOLUTE_TOLERANCE_KCAL = 20;

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function buildReferenceBlock(pastMeals: PastMeal[]): string {
  if (pastMeals.length === 0) return "";

  // User-verified (manually corrected) entries are the most trustworthy —
  // surface them first so they're never pushed out by the MAX_REFERENCE_MEALS cap.
  const sorted = [...pastMeals].sort((a, b) => Number(b.verified) - Number(a.verified));

  const lines = sorted.slice(0, MAX_REFERENCE_MEALS).map((meal) => {
    const date = meal.loggedAt.toISOString().slice(0, 10);
    const itemized = meal.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      calories: i.calories,
      protein: i.proteinG,
      carbs: i.carbsG,
      fat: i.fatG,
      fiber: i.fiberG,
    }));
    const tag = meal.verified ? "Reference, user-verified" : "Reference";
    return `[${tag}] "${meal.rawText}" (${date}) -> Itemized: ${JSON.stringify(itemized)}`;
  });

  return (
    "\n\nThis user has logged the following meals before, with the exact nutrition values used at the time. " +
    "Entries tagged 'user-verified' were manually corrected by the user and are ground truth, not a guess:\n" +
    lines.join("\n") +
    "\n\nUse the provided reference meals as high-priority unit baselines if the current food matches an " +
    "existing custom recipe or correction — preferring a user-verified match over a non-verified one if both " +
    "are plausible — but estimate freshly if quantities or items differ."
  );
}

const BASE_SYSTEM_PROMPT = `You are a nutrition estimation assistant. Given a free-text description of a meal or snack, break it into individual food items and estimate reasonable nutrition values for the quantities described (or typical single-serving quantities if none are given).

Follow these rules precisely:

1. Cooked vs. raw weight: Unless the user explicitly writes "raw", assume all meats, poultry, seafood, rice, grains, and potatoes are weighed in their cooked state, and use cooked-state nutrition values.

2. Hidden cooking fat: If a meal is described as "pan-fried", "sautéed", "fried", or "roasted with oil" without specifying the amount of oil, add a distinct, separate line item for the cooking fat (e.g. "Cooking oil / butter (1 tsp / 5g)" with its own calories and fat) rather than omitting it or folding it into another item's numbers.

3. Dressings & sauces: Always give salad dressings, sauces, and condiments their own line item, unless the user explicitly says "no dressing" or "dry".

4. Composite dishes: For composite foods (sushi rolls, burritos, sandwiches, rice bowls, etc.), decompose them into their component elements — carb base, protein portion by cooked weight, cheese, sauces, etc. — rather than guessing a single lump sum for the whole dish.

5. Atwater consistency: Every item's calories must be consistent with standard energy factors: calories ≈ (protein_g * 4) + (carbs_g * 4) + (fat_g * 9). Do not report a calorie value that contradicts the macros you assign to the same item.

6. Fiber: fiber_g must never exceed carbs_g for a given item, since fiber is a component of total carbohydrates.`;

const USDA_INSTRUCTIONS = `

You also have a search_usda_food tool backed by USDA FoodData Central, the federal nutrient database (Foundation Foods, SR Legacy, Survey/FNDDS, and Branded data). For each distinct whole/generic food item in this meal — not cooking oil/butter, and not a homemade custom recipe unlikely to exist as a single database entry — call search_usda_food with a short, specific query (e.g. "chicken breast cooked", not "chicken") to ground that item's numbers in real measured data instead of estimating from memory.

Prefer a "Foundation" or "SR Legacy" match for generic whole foods — they're the cleanest reference data. Use a "Branded" match only when the user names a specific product or restaurant item, and prefer results whose brandOwner matches what the user said. All per100g values are per 100 grams of the food; scale them yourself to the item's actual quantity. If labelServingSize/labelServingUnit is present, that's the manufacturer's stated serving size in grams, in case it's a more natural unit to reason from.

If a search returns no good match, or the item is a custom recipe, fall back to your own best estimate — never let a bad or irrelevant search result override common sense. You may search for multiple items, one at a time or reviewing several before deciding. Once every item is resolved, call log_meal_nutrition exactly once with the final structured result — never ask a clarifying question.`;

function buildSystemPrompt(pastMeals: PastMeal[], includeUsda: boolean): string {
  return BASE_SYSTEM_PROMPT + (includeUsda ? USDA_INSTRUCTIONS : "") + buildReferenceBlock(pastMeals);
}

const logMealTool: Anthropic.Tool = {
  name: LOG_TOOL_NAME,
  description: "Records the final structured nutrition breakdown of a logged meal.",
  input_schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Short food item name, e.g. 'grilled chicken breast'" },
            quantity: { type: "string", description: "Quantity/serving size, e.g. '6 oz' or '1 cup'" },
            calories: { type: "integer" },
            proteinG: { type: "integer", description: "Grams of protein" },
            carbsG: { type: "integer", description: "Grams of carbohydrates" },
            fatG: { type: "integer", description: "Grams of fat" },
            fiberG: { type: "integer", description: "Grams of dietary fiber" },
          },
          required: ["name", "quantity", "calories", "proteinG", "carbsG", "fatG", "fiberG"],
        },
      },
    },
    required: ["items"],
  },
};

const searchUsdaTool: Anthropic.Tool = {
  name: SEARCH_TOOL_NAME,
  description:
    "Searches USDA FoodData Central for a single food item and returns up to 5 candidate matches with their " +
    "per-100g nutrition values. Call once per distinct food item that isn't a custom recipe.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A short, specific food name to search for, e.g. 'chicken breast cooked' or 'white rice cooked'.",
      },
    },
    required: ["query"],
  },
};

function formatSearchResults(candidates: FdcCandidate[]): string {
  if (candidates.length === 0) {
    return "No USDA FoodData Central results found for this query. Use your own nutrition knowledge to estimate this item instead.";
  }
  return JSON.stringify(candidates);
}

function clampNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Deterministically reconciles a single model-produced item: clamps negative
 * values, enforces fiber <= carbs, and re-anchors calories to the Atwater
 * formula when the model's stated calories drift too far from what its own
 * macros imply. This runs in code rather than relying on the model to get
 * the arithmetic right every time.
 */
export function reconcileItem(item: ParsedMealItem): ParsedMealItem {
  const proteinG = clampNonNegative(item.proteinG);
  const fatG = clampNonNegative(item.fatG);
  let carbsG = clampNonNegative(item.carbsG);
  const fiberG = clampNonNegative(item.fiberG);
  let calories = clampNonNegative(item.calories);

  if (fiberG > carbsG) {
    carbsG = fiberG;
  }

  const expectedCalories = proteinG * 4 + carbsG * 4 + fatG * 9;
  const deviation = Math.abs(calories - expectedCalories);
  if (deviation > expectedCalories * ATWATER_RELATIVE_TOLERANCE && deviation > ATWATER_ABSOLUTE_TOLERANCE_KCAL) {
    calories = Math.round(expectedCalories);
  }

  return {
    name: item.name,
    quantity: item.quantity,
    calories,
    proteinG,
    carbsG,
    fatG,
    fiberG,
  };
}

export function sumItems(items: ParsedMealItem[]): Omit<ParsedMeal, "items"> {
  return items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      proteinG: acc.proteinG + item.proteinG,
      carbsG: acc.carbsG + item.carbsG,
      fatG: acc.fatG + item.fatG,
      fiberG: acc.fiberG + item.fiberG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );
}

function emptyMeal(rawText: string): ParsedMeal {
  return {
    items: [{ name: rawText, quantity: "1 serving", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 }],
    calories: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    fiberG: 0,
  };
}

export async function parseMeal(rawText: string, pastMeals: PastMeal[] = []): Promise<ParsedMeal> {
  const anthropic = client();

  if (!anthropic) {
    // No API key configured — fall back to a single unestimated item so the
    // entry is still saved and can be edited later.
    return emptyMeal(rawText);
  }

  const withUsda = usdaEnabled();
  const tools = withUsda ? [searchUsdaTool, logMealTool] : [logMealTool];
  const system = buildSystemPrompt(pastMeals, withUsda);

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: rawText }];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const isLastRound = round === MAX_TOOL_ROUNDS - 1;
    // Once USDA search isn't offered (or we're out of rounds), force the
    // final tool so we always get back a usable, schema-valid result.
    const toolChoice: Anthropic.ToolChoice =
      withUsda && !isLastRound ? { type: "auto" } : { type: "tool", name: LOG_TOOL_NAME };

    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1536,
      system,
      messages,
      tool_choice: toolChoice,
      tools,
    });

    const toolUseBlocks = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    const finalize = toolUseBlocks.find((block) => block.name === LOG_TOOL_NAME);
    if (finalize) {
      const rawItems = (finalize.input as { items?: ParsedMealItem[] } | undefined)?.items ?? [];
      const items = rawItems.map(reconcileItem);
      return { items, ...sumItems(items) };
    }

    const searches = toolUseBlocks.filter((block) => block.name === SEARCH_TOOL_NAME);
    if (searches.length === 0) {
      // The model responded with plain text instead of a tool call — nudge
      // it back on track rather than looping forever.
      messages.push({ role: "assistant", content: message.content });
      messages.push({
        role: "user",
        content: "Please respond by calling either search_usda_food or log_meal_nutrition — not with plain text.",
      });
      continue;
    }

    messages.push({ role: "assistant", content: message.content });
    const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
      searches.map(async (block) => {
        const query = (block.input as { query?: string } | undefined)?.query ?? "";
        const candidates = await searchUsdaFood(query);
        console.log(`[USDA] "${query}" -> ${candidates.length} result(s)${candidates[0] ? `, top: ${candidates[0].description}` : ""}`);
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: formatSearchResults(candidates),
        };
      }),
    );
    messages.push({ role: "user", content: toolResults });
  }

  // Exhausted MAX_TOOL_ROUNDS without a finalize call (shouldn't happen given
  // the forced last round, but keep the request from ever throwing).
  return emptyMeal(rawText);
}
