// Thin client for USDA FoodData Central (https://fdc.nal.usda.gov), the
// public nutrient database maintained by USDA's Agricultural Research
// Service (including data originating from the Beltsville Human Nutrition
// Research Center). Used to ground meal-parsing nutrition estimates in real
// measured data instead of relying solely on the model's trained knowledge.

export interface FdcCandidate {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner: string | null;
  /** Grams for the manufacturer-stated serving, when FDC provides one (Branded foods). */
  labelServingSize: number | null;
  labelServingUnit: string | null;
  /** All macro values below are per 100g of the food, per FDC convention. */
  per100g: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    fiberG: number | null;
  };
}

// FDC nutrient IDs are stable identifiers, more reliable to match on than
// the free-text nutrientName, which varies slightly across data types.
const NUTRIENT_ID = {
  ENERGY_KCAL: 1008,
  PROTEIN: 1003,
  CARBS: 1005,
  FAT: 1004,
  FIBER: 1079,
};

interface FdcFoodNutrient {
  nutrientId?: number;
  value?: number;
}

interface FdcFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  foodNutrients?: FdcFoodNutrient[];
}

function pickNutrient(nutrients: FdcFoodNutrient[] | undefined, nutrientId: number): number | null {
  const match = nutrients?.find((n) => n.nutrientId === nutrientId);
  return typeof match?.value === "number" ? match.value : null;
}

export function usdaEnabled(): boolean {
  return !!process.env.USDA_FDC_API_KEY;
}

/**
 * Searches USDA FoodData Central for foods matching a short query (e.g. one
 * ingredient at a time — "grilled chicken breast", not a whole meal). Returns
 * up to 5 candidates, or an empty array on any failure (missing key, rate
 * limit, network error, no matches) — callers should treat that as "no
 * grounding available, fall back to estimating" rather than an error.
 */
export async function searchUsdaFood(query: string): Promise<FdcCandidate[]> {
  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey || !query.trim()) return [];

  try {
    const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("query", query.trim());
    url.searchParams.set("pageSize", "5");

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];

    const data = (await res.json()) as { foods?: FdcFood[] };
    const foods = Array.isArray(data.foods) ? data.foods : [];

    return foods.map((food) => ({
      fdcId: food.fdcId,
      description: food.description,
      dataType: food.dataType,
      brandOwner: food.brandOwner ?? null,
      labelServingSize: typeof food.servingSize === "number" ? food.servingSize : null,
      labelServingUnit: food.servingSizeUnit ?? null,
      per100g: {
        calories: pickNutrient(food.foodNutrients, NUTRIENT_ID.ENERGY_KCAL),
        proteinG: pickNutrient(food.foodNutrients, NUTRIENT_ID.PROTEIN),
        carbsG: pickNutrient(food.foodNutrients, NUTRIENT_ID.CARBS),
        fatG: pickNutrient(food.foodNutrients, NUTRIENT_ID.FAT),
        fiberG: pickNutrient(food.foodNutrients, NUTRIENT_ID.FIBER),
      },
    }));
  } catch {
    // Network error, timeout, or rate limit — degrade gracefully.
    return [];
  }
}
