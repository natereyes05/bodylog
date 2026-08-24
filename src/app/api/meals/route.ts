import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseMeal } from "@/lib/parseMeal";
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
  const rawText = typeof body?.rawText === "string" ? body.rawText.trim() : "";

  if (!loggedAt || Number.isNaN(loggedAt.getTime())) {
    return NextResponse.json({ error: "Invalid date/time." }, { status: 400 });
  }
  if (!rawText) {
    return NextResponse.json({ error: "Describe what you ate." }, { status: 400 });
  }

  const parsed = await parseMeal(rawText);

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
    },
  });

  return NextResponse.json(log, { status: 201 });
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
