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
  items: ParsedMealItem[];
}

const TOOL_NAME = "log_meal_nutrition";
const MAX_REFERENCE_MEALS = 60;

function client() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  return new Anthropic({ apiKey });
}

function buildReferenceBlock(pastMeals: PastMeal[]): string {
  if (pastMeals.length === 0) return "";

  const lines = pastMeals.slice(0, MAX_REFERENCE_MEALS).map((meal) => {
    const itemList = meal.items
      .map((i) => `${i.name} (${i.quantity}): ${i.calories} kcal, ${i.proteinG}g protein, ${i.carbsG}g carbs, ${i.fatG}g fat, ${i.fiberG}g fiber`)
      .join("; ");
    return `- "${meal.rawText}" → ${itemList}`;
  });

  return (
    "\n\nHere are foods this same user has logged before, with the exact nutrition values used at the time:\n" +
    lines.join("\n") +
    "\n\nIf the new entry is the same food or a clear repeat of one of these — even if worded differently — " +
    "reuse those exact values instead of estimating fresh, so the user's numbers stay consistent over time. " +
    "If it's a different food, a different quantity, or a variation, estimate normally instead."
  );
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
    max_tokens: 1024,
    system:
      "You are a nutrition estimation assistant. Given a free-text description of a meal or snack, " +
      "break it into individual food items and estimate reasonable nutrition values for the quantities " +
      "described (or typical single-serving quantities if none are given). Use your best real-world " +
      "knowledge of nutrition. Always call the log_meal_nutrition tool exactly once with your best estimate " +
      "— never ask a clarifying question." +
      buildReferenceBlock(pastMeals),
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

  const items = (toolUse?.input as { items?: ParsedMealItem[] } | undefined)?.items ?? [];

  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      proteinG: acc.proteinG + (item.proteinG || 0),
      carbsG: acc.carbsG + (item.carbsG || 0),
      fatG: acc.fatG + (item.fatG || 0),
      fiberG: acc.fiberG + (item.fiberG || 0),
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
  );

  return { items, ...totals };
}
