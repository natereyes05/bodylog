import Anthropic from "@anthropic-ai/sdk";

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
}

const TOOL_NAME = "log_meal_nutrition";
const MAX_REFERENCE_MEALS = 60;

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

  const lines = pastMeals.slice(0, MAX_REFERENCE_MEALS).map((meal) => {
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
    return `[Reference] "${meal.rawText}" (${date}) -> Itemized: ${JSON.stringify(itemized)}`;
  });

  return (
    "\n\nThis user has logged the following meals before, with the exact nutrition values used at the time:\n" +
    lines.join("\n") +
    "\n\nUse the provided reference meals as high-priority unit baselines if the current food matches an " +
    "existing custom recipe or correction, but estimate freshly if quantities or items differ."
  );
}

const SYSTEM_PROMPT = `You are a nutrition estimation assistant. Given a free-text description of a meal or snack, break it into individual food items and estimate reasonable nutrition values for the quantities described (or typical single-serving quantities if none are given). Always call the log_meal_nutrition tool exactly once with your best estimate — never ask a clarifying question.

Follow these rules precisely:

1. Cooked vs. raw weight: Unless the user explicitly writes "raw", assume all meats, poultry, seafood, rice, grains, and potatoes are weighed in their cooked state, and use cooked-state nutrition values.

2. Hidden cooking fat: If a meal is described as "pan-fried", "sautéed", "fried", or "roasted with oil" without specifying the amount of oil, add a distinct, separate line item for the cooking fat (e.g. "Cooking oil / butter (1 tsp / 5g)" with its own calories and fat) rather than omitting it or folding it into another item's numbers.

3. Dressings & sauces: Always give salad dressings, sauces, and condiments their own line item, unless the user explicitly says "no dressing" or "dry".

4. Composite dishes: For composite foods (sushi rolls, burritos, sandwiches, rice bowls, etc.), decompose them into their component elements — carb base, protein portion by cooked weight, cheese, sauces, etc. — rather than guessing a single lump sum for the whole dish.

5. Atwater consistency: Every item's calories must be consistent with standard energy factors: calories ≈ (protein_g * 4) + (carbs_g * 4) + (fat_g * 9). Do not report a calorie value that contradicts the macros you assign to the same item.

6. Fiber: fiber_g must never exceed carbs_g for a given item, since fiber is a component of total carbohydrates.`;

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

export async function parseMeal(rawText: string, pastMeals: PastMeal[] = []): Promise<ParsedMeal> {
  const anthropic = client();

  if (!anthropic) {
    // No API key configured — fall back to a single unestimated item so the
    // entry is still saved and can be edited later.
    return {
      items: [
        { name: rawText, quantity: "1 serving", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
      ],
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
    };
  }

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1536,
    system: SYSTEM_PROMPT + buildReferenceBlock(pastMeals),
    messages: [{ role: "user", content: rawText }],
    tool_choice: { type: "tool", name: TOOL_NAME },
    tools: [
      {
        name: TOOL_NAME,
        description: "Records the structured nutrition breakdown of a logged meal.",
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
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );

  const rawItems = (toolUse?.input as { items?: ParsedMealItem[] } | undefined)?.items ?? [];
  const items = rawItems.map(reconcileItem);

  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      proteinG: acc.proteinG + item.proteinG,
      carbsG: acc.carbsG + item.carbsG,
      fatG: acc.fatG + item.fatG,
      fiberG: acc.fiberG + item.fiberG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );

  return { items, ...totals };
}
