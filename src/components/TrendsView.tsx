"use client";

import { useEffect, useMemo, useState } from "react";
import { format, subDays } from "date-fns";
import type { MealLogDTO, WeightLogDTO } from "@/lib/types";

const RANGE_DAYS = 30;

export default function TrendsView() {
  const [weightLogs, setWeightLogs] = useState<WeightLogDTO[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLogDTO[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const from = subDays(new Date(), RANGE_DAYS).toISOString();
    const to = new Date().toISOString();
    const qs = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
    Promise.all([fetch(`/api/weight?${qs}`), fetch(`/api/meals?${qs}`)]).then(
      async ([weightRes, mealRes]) => {
        setWeightLogs(weightRes.ok ? await weightRes.json() : []);
        setMealLogs(mealRes.ok ? await mealRes.json() : []);
        setLoading(false);
      },
    );
  }, []);

  const chronological = useMemo(() => [...weightLogs].reverse(), [weightLogs]);

  const avgCalories7d = useMemo(() => {
    const cutoff = subDays(new Date(), 7);
    const recent = mealLogs.filter((m) => new Date(m.loggedAt) >= cutoff);
    if (recent.length === 0) return null;
    const byDay = new Map<string, number>();
    for (const m of recent) {
      const day = format(new Date(m.loggedAt), "yyyy-MM-dd");
      byDay.set(day, (byDay.get(day) ?? 0) + (m.calories ?? 0));
    }
    const values = [...byDay.values()];
    return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }, [mealLogs]);

  const weightChange = useMemo(() => {
    if (chronological.length < 2) return null;
    const first = chronological[0];
    const last = chronological[chronological.length - 1];
    if (first.weightUnit !== last.weightUnit) return null;
    return { delta: last.weightValue - first.weightValue, unit: last.weightUnit };
  }, [chronological]);

  const chart = useMemo(() => {
    if (chronological.length < 2) return null;
    const values = chronological.map((w) => w.weightValue);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const width = 320;
    const height = 120;
    const padding = 12;

    const points = chronological.map((w, i) => {
      const x = padding + (i / (chronological.length - 1)) * (width - padding * 2);
      const y = height - padding - ((w.weightValue - min) / span) * (height - padding * 2);
      return { x, y };
    });

    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

    return { path, points, width, height, min, max };
  }, [chronological]);

  if (loading) {
    return <p className="py-8 text-center text-sm text-muted">Loading…</p>;
  }

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-8">
      <h1 className="mb-4 text-lg font-semibold">Last {RANGE_DAYS} days</h1>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Weight change</p>
          <p className="mt-1 text-xl font-semibold">
            {weightChange
              ? `${weightChange.delta > 0 ? "+" : ""}${weightChange.delta.toFixed(1)} ${weightChange.unit}`
              : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="text-xs font-medium text-muted">Avg kcal / day (7d)</p>
          <p className="mt-1 text-xl font-semibold">{avgCalories7d ?? "—"}</p>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-border bg-surface p-4">
        <p className="mb-3 text-sm font-medium text-muted">Weight</p>
        {chart ? (
          <svg viewBox={`0 0 ${chart.width} ${chart.height}`} className="w-full">
            <path d={chart.path} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {chart.points.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--accent)" />
            ))}
          </svg>
        ) : (
          <p className="py-6 text-center text-sm text-muted">Log weight on at least two days to see a trend.</p>
        )}
      </div>

      <p className="mb-3 text-sm font-medium text-muted">Recent entries</p>
      <ul className="space-y-2">
        {weightLogs.map((w) => (
          <li
            key={w.id}
            className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4"
          >
            <span className="text-sm">{format(new Date(w.loggedAt), "EEE, MMM d · h:mm a")}</span>
            <span className="text-sm font-semibold">
              {w.weightValue} {w.weightUnit}
            </span>
          </li>
        ))}
        {weightLogs.length === 0 && (
          <li className="py-8 text-center text-sm text-muted">No weight entries yet.</li>
        )}
      </ul>
    </div>
  );
}
