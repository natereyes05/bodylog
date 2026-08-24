import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const logs = await prisma.weightLog.findMany({
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
  const weightValue = Number(body?.weightValue);
  const weightUnit = body?.weightUnit === "kg" ? "kg" : "lb";

  if (!loggedAt || Number.isNaN(loggedAt.getTime())) {
    return NextResponse.json({ error: "Invalid date/time." }, { status: 400 });
  }
  if (!Number.isFinite(weightValue) || weightValue <= 0 || weightValue > 2000) {
    return NextResponse.json({ error: "Enter a valid weight." }, { status: 400 });
  }

  const log = await prisma.weightLog.create({
    data: { userId: session.user.id, loggedAt, weightValue, weightUnit },
  });

  return NextResponse.json(log, { status: 201 });
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  await prisma.weightLog.deleteMany({ where: { id, userId: session.user.id } });
  return NextResponse.json({ ok: true });
}
