import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseMeal, sumItems, type ParsedMealItem, type PastMeal } from "@/lib/parseMeal";
import type { Prisma } from "@/generated/prisma/client";

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

  const recentMeals = await prisma.mealLog.findMany({
    where: { userId: session.user.id },
    // `distinct` keeps the first row per rawText group according to this
    // ordering, so a user-edited (verified) entry always wins over a newer
    // but unverified one sharing the same description.
    orderBy: [{ userEdited: "desc" }, { loggedAt: "desc" }],
    distinct: ["rawText"],
    take: 60,
    select: { rawText: true, loggedAt: true, items: true, userEdited: true },
  });
  const pastMeals: PastMeal[] = recentMeals.map((m) => ({
    rawText: m.rawText,
    loggedAt: m.loggedAt,
    items: m.items as unknown as ParsedMealItem[],
    verified: m.userEdited,
  }));

  const parsed = await parseMeal(rawText, pastMeals);

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
