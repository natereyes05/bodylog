import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseMeal, sumItems, type ParsedMealItem, type PastMeal, type TodayMealContext } from "@/lib/parseMeal";
import type { Prisma } from "@/generated/prisma/client";

// Multi-round tool-calling (USDA/restaurant search, several rounds deep for
// a multi-item meal) can take well past Vercel's default serverless timeout.
export const maxDuration = 60;

const MAX_REFERENCE_CANDIDATES = 60;
const MAX_REFERENCE_MEALS_IN_PROMPT = 10;
const STOP_WORDS = new Set([
  "a", "an", "the", "with", "and", "of", "in", "on", "to", "for", "some", "my", "i", "was", "were", "is", "are", "at", "it", "this", "that",
]);

function extractKeywords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function keywordOverlap(keywords: Set<string>, text: string): number {
  const textKeywords = extractKeywords(text);
  let count = 0;
  for (const w of keywords) if (textKeywords.has(w)) count++;
  return count;
}

interface ReferenceCandidate {
  rawText: string;
  loggedAt: Date;
  items: Prisma.JsonValue;
  userEdited: boolean;
}

/**
 * Narrows the candidate pool of past meals down to the ~10 most relevant to
 * the new entry — ranked by keyword overlap with rawText, with user-edited
 * ("verified") entries prioritized as a tiebreaker — instead of handing the
 * model all 60 candidates on every request, which inflates prompt size and
 * slows Haiku down for no benefit on unrelated meals.
 */
function selectRelevantPastMeals(rawText: string, candidates: ReferenceCandidate[]): ReferenceCandidate[] {
  const keywords = extractKeywords(rawText);
  const scored = candidates.map((meal) => ({
    meal,
    score: keywords.size > 0 ? keywordOverlap(keywords, meal.rawText) : 0,
  }));

  const matched = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || Number(b.meal.userEdited) - Number(a.meal.userEdited));

  if (matched.length > 0) {
    return matched.slice(0, MAX_REFERENCE_MEALS_IN_PROMPT).map((s) => s.meal);
  }

  // No keyword overlap with anything on record — fall back to the 5 most
  // recent verified (user-edited) meals, or 5 most recent overall if none
  // have ever been edited yet.
  const verified = candidates.filter((m) => m.userEdited).slice(0, 5);
  return verified.length > 0 ? verified : candidates.slice(0, 5);
}

function utcDayRange(date: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
  const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
  return { from, to };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const logs = await prisma.mealLog.findMany({
    where: {
      userId: session.user.id,
      ...(from && to ? { loggedAt: { gte: new Date(from), lte: new Date(to) } } : {}),
    },
    orderBy: { loggedAt: "desc" },
  });

  return NextResponse.json(logs);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const loggedAt = body?.loggedAt ? new Date(body.loggedAt) : null;
  const favoriteId = typeof body?.favoriteId === "string" ? body.favoriteId : null;
  const rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";

  if (!loggedAt || Number.isNaN(loggedAt.getTime())) {
    return NextResponse.json({ error: "Invalid date/time." }, { status: 400 });
  }

  // Quick-log path: reuse a saved favorite's exact numbers, no AI call at all.
  if (favoriteId) {
    const favorite = await prisma.favoriteMeal.findFirst({
      where: { id: favoriteId, userId: session.user.id },
    });
    if (!favorite) {
      return NextResponse.json({ error: "Favorite not found." }, { status: 404 });
    }

    const log = await prisma.mealLog.create({
      data: {
        userId: session.user.id,
        loggedAt,
        rawText: favorite.rawText,
        items: favorite.items as Prisma.InputJsonValue,
        calories: favorite.calories,
        proteinG: favorite.proteinG,
        carbsG: favorite.carbsG,
        fatG: favorite.fatG,
        fiberG: favorite.fiberG,
      },
    });
    return NextResponse.json(log, { status: 201 });
  }

  if (!rawText) {
    return NextResponse.json({ error: "Describe what you ate." }, { status: 400 });
  }

  const { from: dayStart, to: dayEnd } = utcDayRange(loggedAt);

  const [recentMeals, todaysMealsRaw, user] = await Promise.all([
    prisma.mealLog.findMany({
      where: { userId: session.user.id },
      // `distinct` keeps the first row per rawText group according to this
      // ordering, so a user-edited (verified) entry always wins over a newer
      // but unverified one sharing the same description.
      orderBy: [{ userEdited: "desc" }, { loggedAt: "desc" }],
      distinct: ["rawText"],
      take: MAX_REFERENCE_CANDIDATES,
      select: { rawText: true, loggedAt: true, items: true, userEdited: true },
    }),
    prisma.mealLog.findMany({
      where: { userId: session.user.id, loggedAt: { gte: dayStart, lte: dayEnd } },
      orderBy: { loggedAt: "asc" },
      take: 20,
      select: { rawText: true, loggedAt: true, items: true },
    }),
    prisma.user.findUnique({ where: { id: session.user.id }, select: { locationHint: true } }),
  ]);

  const relevant = selectRelevantPastMeals(rawText, recentMeals);
  console.log(`[RefMemory] "${rawText}" -> ${recentMeals.length} candidates, ${relevant.length} selected: ${relevant.map((m) => `"${m.rawText}"`).join(", ")}`);
  const pastMeals: PastMeal[] = relevant.map((m) => ({
    rawText: m.rawText,
    loggedAt: m.loggedAt,
    items: m.items as unknown as ParsedMealItem[],
    verified: m.userEdited,
  }));

  const todaysMeals: TodayMealContext[] = todaysMealsRaw.map((m) => ({
    rawText: m.rawText,
    loggedAt: m.loggedAt,
    items: m.items as unknown as ParsedMealItem[],
  }));

  const parsed = await parseMeal(rawText, pastMeals, todaysMeals, user?.locationHint);

  const log = await prisma.mealLog.create({
    data: {
      userId: session.user.id,
      loggedAt,
      rawText,
      items: parsed.items as unknown as Prisma.InputJsonValue,
      calories: parsed.calories,
      proteinG: parsed.proteinG,
      carbsG: parsed.carbsG,
      fatG: parsed.fatG,
      fiberG: parsed.fiberG,
    },
  });

  return NextResponse.json(log, { status: 201 });
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.items) ? (body.items as ParsedMealItem[]) : null;
  if (!items || items.length === 0) {
    return NextResponse.json({ error: "At least one item is required." }, { status: 400 });
  }
  for (const item of items) {
    if (typeof item.name !== "string" || !item.name.trim()) {
      return NextResponse.json({ error: "Every item needs a name." }, { status: 400 });
    }
  }

  const existing = await prisma.mealLog.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const normalized: ParsedMealItem[] = items.map((item) => ({
    name: item.name.trim(),
    quantity: typeof item.quantity === "string" ? item.quantity.trim() : "",
    calories: Number(item.calories) || 0,
    proteinG: Number(item.proteinG) || 0,
    carbsG: Number(item.carbsG) || 0,
    fatG: Number(item.fatG) || 0,
    fiberG: Number(item.fiberG) || 0,
  }));
  const totals = sumItems(normalized);

  const log = await prisma.mealLog.update({
    where: { id },
    data: {
      items: normalized as unknown as Prisma.InputJsonValue,
      calories: totals.calories,
      proteinG: totals.proteinG,
      carbsG: totals.carbsG,
      fatG: totals.fatG,
      fiberG: totals.fiberG,
      userEdited: true,
    },
  });

  return NextResponse.json(log);
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  await prisma.mealLog.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
