import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const favorites = await prisma.favoriteMeal.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(favorites);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const mealLogId = typeof body?.mealLogId === "string" ? body.mealLogId : null;
  if (!mealLogId) return NextResponse.json({ error: "Missing mealLogId." }, { status: 400 });

  const meal = await prisma.mealLog.findFirst({
    where: { id: mealLogId, userId: session.user.id },
  });
  if (!meal) return NextResponse.json({ error: "Meal not found." }, { status: 404 });

  const existing = await prisma.favoriteMeal.findFirst({
    where: {
      userId: session.user.id,
      rawText: { equals: meal.rawText, mode: "insensitive" },
    },
  });
  if (existing) return NextResponse.json(existing, { status: 200 });

  const favorite = await prisma.favoriteMeal.create({
    data: {
      userId: session.user.id,
      rawText: meal.rawText,
      items: meal.items as Prisma.InputJsonValue,
      calories: meal.calories,
      proteinG: meal.proteinG,
      carbsG: meal.carbsG,
      fatG: meal.fatG,
      fiberG: meal.fiberG,
    },
  });

  return NextResponse.json(favorite, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  await prisma.favoriteMeal.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
