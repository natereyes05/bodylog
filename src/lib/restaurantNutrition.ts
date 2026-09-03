// Live web search for published restaurant/chain nutrition disclosures, via
// Tavily (a search API built for LLM consumption — it returns cleaned,
// summarized page content rather than raw search-result HTML). USDA
// FoodData Central has no reliable current chain-restaurant menu data, so
// this fills that gap for meals that name a restaurant or fast-food chain.

const FALLBACK_MESSAGE =
  "No usable restaurant nutrition search results. Deconstruct this item into its likely ingredients and " +
  "estimate using standard whole-food nutrition knowledge (or search_usda_food for the components) instead.";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
}

interface TavilyResponse {
  answer?: string;
  results?: TavilyResult[];
}

export function restaurantSearchEnabled(): boolean {
  return !!process.env.TAVILY_API_KEY;
}

/**
 * Searches for published nutrition facts for a specific restaurant + menu
 * item. Returns a plain-text block ready to hand back as a tool_result —
 * never throws; any failure degrades to a fallback instruction string so a
 * flaky search never breaks meal logging.
 */
export async function searchRestaurantNutrition(
  restaurant: string,
  item: string,
  locationHint?: string | null,
): Promise<string> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return "Restaurant nutrition search is not configured. Estimate using your own knowledge instead.";
  }

  const location = locationHint?.trim();
  const query = (
    location
      ? `${restaurant} ${item} nutrition facts calories protein (${location})`
      : `${restaurant} ${item} nutrition facts calories protein`
  ).trim();

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        include_answer: true,
        max_results: 4,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return FALLBACK_MESSAGE;

    const data = (await res.json()) as TavilyResponse;
    const results = (data.results ?? []).slice(0, 4);

    if (!data.answer && results.length === 0) return FALLBACK_MESSAGE;

    const parts: string[] = [];
    if (data.answer) parts.push(`Summary: ${data.answer}`);
    results.forEach((r, i) => {
      parts.push(`[${i + 1}] ${r.title} (${r.url})\n${r.content.slice(0, 600)}`);
    });

    return parts.join("\n\n");
  } catch {
    // Network error, timeout, or rate limit — degrade gracefully.
    return FALLBACK_MESSAGE;
  }
}
