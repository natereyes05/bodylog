import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const GOAL_FIELDS = ["calorieGoal", "proteinGoalG", "carbsGoalG", "fatGoalG", "fiberGoalG"] as const;
type GoalField = (typeof GOAL_FIELDS)[number];

const SELECT = {
  name: true,
  email: true,
  calorieGoal: true,
  proteinGoalG: true,
  carbsGoalG: true,
  fatGoalG: true,
  fiberGoalG: true,
  locationHint: true,
} as const;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: SELECT,
  });
  if (!user) return NextResponse.json({ error: "Not found." }, { status: 404 });

  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data: Partial<Record<GoalField, number | null>> & { locationHint?: string | null } = {};

  for (const field of GOAL_FIELDS) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw === null || raw === "") {
      data[field] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 100000) {
      return NextResponse.json({ error: `Invalid value for ${field}.` }, { status: 400 });
    }
    data[field] = Math.round(value);
  }

  if ("locationHint" in body) {
    const raw = body.locationHint;
    if (raw === null || raw === "") {
      data.locationHint = null;
    } else if (typeof raw === "string" && raw.trim().length <= 200) {
      data.locationHint = raw.trim();
    } else {
      return NextResponse.json({ error: "Invalid location." }, { status: 400 });
    }
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: SELECT,
  });

  return NextResponse.json(user);
}
