"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import AddEntrySheet from "@/components/AddEntrySheet";
import EditMealSheet from "@/components/EditMealSheet";
import ProgressRing from "@/components/ProgressRing";
import { dayRange, formatTime, friendlyDayLabel, shiftDay, toDateInputValue } from "@/lib/dateUtils";
import type { FavoriteMealDTO, MealLogDTO, ProfileDTO, WeightLogDTO } from "@/lib/types";

export default function Dashboard({ userName }: { userName: string | null }) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [weightLogs, setWeightLogs] = useState<WeightLogDTO[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLogDTO[]>([]);
  const [favorites, setFavorites] = useState<FavoriteMealDTO[]>([]);
  const [goals, setGoals] = useState<ProfileDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetTab, setSheetTab] = useState<"weight" | "meal">("meal");
  const [editingMeal, setEditingMeal] = useState<MealLogDTO | null>(null);
  const [favoritingId, setFavoritingId] = useState<string | null>(null);

  const load = useCallback(async (date: Date) => {
    setLoading(true);
    const { from, to } = dayRange(date);
    const qs = `from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
    const [weightRes, mealRes] = await Promise.all([
      fetch(`/api/weight?${qs}`),
      fetch(`/api/meals?${qs}`),
    ]);
    setWeightLogs(weightRes.ok ? await weightRes.json() : []);
    setMealLogs(mealRes.ok ? await mealRes.json() : []);
    setLoading(false);
  }, []);

  const loadFavorites = useCallback(async () => {
    const res = await fetch("/api/favorites");
    setFavorites(res.ok ? await res.json() : []);
  }, []);

  const loadGoals = useCallback(async () => {
    const res = await fetch("/api/profile");
    setGoals(res.ok ? await res.json() : null);
  }, []);

  useEffect(() => {
    // Fetch-on-mount/date-change; the lint rule can't see that `load`'s first
    // setState is intentional (shows the loading state for the new date).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(selectedDate);
  }, [selectedDate, load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadFavorites();
    loadGoals();
  }, [loadFavorites, loadGoals]);

  const deleteWeight = async (id: string) => {
    setWeightLogs((prev) => prev.filter((w) => w.id !== id));
    await fetch(`/api/weight?id=${id}`, { method: "DELETE" });
  };

  const deleteMeal = async (id: string) => {
    setMealLogs((prev) => prev.filter((m) => m.id !== id));
    await fetch(`/api/meals?id=${id}`, { method: "DELETE" });
  };

  const isFavorited = (rawText: string) =>
    favorites.some((f) => f.rawText.trim().toLowerCase() === rawText.trim().toLowerCase());

  const toggleFavorite = async (meal: MealLogDTO) => {
    const existing = favorites.find(
      (f) => f.rawText.trim().toLowerCase() === meal.rawText.trim().toLowerCase(),
    );
    setFavoritingId(meal.id);
    try {
      if (existing) {
        setFavorites((prev) => prev.filter((f) => f.id !== existing.id));
        await fetch(`/api/favorites?id=${existing.id}`, { method: "DELETE" });
      } else {
        const res = await fetch("/api/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mealLogId: meal.id }),
        });
        if (res.ok) {
          const favorite = await res.json();
          setFavorites((prev) => [favorite, ...prev.filter((f) => f.id !== favorite.id)]);
        }
      }
    } finally {
      setFavoritingId(null);
    }
  };

  const openSheet = (tab: "weight" | "meal") => {
    setSheetTab(tab);
    setSheetOpen(true);
  };

  const totalCalories = mealLogs.reduce((sum, m) => sum + (m.calories ?? 0), 0);
  const totalProtein = mealLogs.reduce((sum, m) => sum + (m.proteinG ?? 0), 0);
  const totalCarbs = mealLogs.reduce((sum, m) => sum + (m.carbsG ?? 0), 0);
  const totalFat = mealLogs.reduce((sum, m) => sum + (m.fatG ?? 0), 0);
  const totalFiber = mealLogs.reduce((sum, m) => sum + (m.fiberG ?? 0), 0);
  const latestWeight = weightLogs[0];

  return (
    <div className="mx-auto max-w-lg px-4 pt-4">
      {userName && <p className="mb-1 text-sm text-muted">Hey {userName.split(" ")[0]} 👋</p>}

      <div className="mb-5 flex items-center justify-between">
        <button
          onClick={() => setSelectedDate((d) => shiftDay(d, -1))}
          className="rounded-full border border-border p-2 text-muted"
          aria-label="Previous day"
        >
          ‹
        </button>
        <label className="flex flex-col items-center">
          <span className="text-lg font-semibold">{friendlyDayLabel(selectedDate)}</span>
          <input
            type="date"
            value={toDateInputValue(selectedDate)}
            onChange={(e) => e.target.value && setSelectedDate(new Date(`${e.target.value}T00:00:00`))}
            className="w-0 opacity-0"
          />
        </label>
        <button
          onClick={() => setSelectedDate((d) => shiftDay(d, 1))}
          className="rounded-full border border-border p-2 text-muted"
          aria-label="Next day"
        >
          ›
        </button>
      </div>

      {goals && (goals.calorieGoal || goals.proteinGoalG || goals.fiberGoalG) ? (
        <div className="mb-3 flex items-center justify-around rounded-2xl border border-border bg-surface p-4">
          {goals.calorieGoal ? (
            <ProgressRing label="Calories" value={totalCalories} goal={goals.calorieGoal} unit="" />
          ) : null}
          {goals.proteinGoalG ? (
            <ProgressRing label="Protein" value={totalProtein} goal={goals.proteinGoalG} unit="g" />
          ) : null}
          {goals.fiberGoalG ? (
            <ProgressRing label="Fiber" value={totalFiber} goal={goals.fiberGoalG} unit="g" />
          ) : null}
        </div>
      ) : (
        goals && (
          <Link
            href="/profile"
            className="mb-3 block rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted"
          >
            Set daily goals to see progress rings here →
          </Link>
        )
      )}

      <button
        onClick={() => openSheet("weight")}
        className="mb-3 w-full rounded-2xl border border-border bg-surface p-4 text-left"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted">Weight</span>
          {latestWeight ? (
            <span className="text-xs text-muted">{formatTime(new Date(latestWeight.loggedAt))}</span>
          ) : null}
        </div>
        {latestWeight ? (
          <p className="mt-1 text-2xl font-semibold">
            {latestWeight.weightValue} <span className="text-base font-normal text-muted">{latestWeight.weightUnit}</span>
          </p>
        ) : (
          <p className="mt-1 text-base text-muted">No weight logged — tap to add</p>
        )}
      </button>

      <div className="mb-3 rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted">Meals</span>
          <span className="text-sm font-medium">
            {mealLogs.length > 0 ? `${totalCalories} kcal today` : "Nothing logged yet"}
          </span>
        </div>
        {mealLogs.length > 0 && (
          <p className="mt-1 text-xs text-muted">
            P {totalProtein}g · C {totalCarbs}g · F {totalFat}g · Fiber {totalFiber}g
          </p>
        )}
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : (
        <ul className="space-y-3 pb-4">
          {mealLogs.map((meal) => (
            <li key={meal.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    {formatTime(new Date(meal.loggedAt))}
                    {meal.userEdited && <span className="ml-1.5 text-accent">· edited</span>}
                  </p>
                  <p className="truncate text-sm font-medium">{meal.rawText}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {meal.calories != null && meal.calories > 0 && (
                    <span className="whitespace-nowrap text-sm font-semibold">{meal.calories} kcal</span>
                  )}
                  <button
                    onClick={() => toggleFavorite(meal)}
                    disabled={favoritingId === meal.id}
                    className={isFavorited(meal.rawText) ? "text-accent" : "text-muted"}
                    aria-label="Toggle favorite"
                  >
                    {isFavorited(meal.rawText) ? "★" : "☆"}
                  </button>
                  <button
                    onClick={() => setEditingMeal(meal)}
                    className="text-muted"
                    aria-label="Edit meal"
                  >
                    ✎
                  </button>
                  <button
                    onClick={() => deleteMeal(meal.id)}
                    className="text-muted"
                    aria-label="Delete meal"
                  >
                    ✕
                  </button>
                </div>
              </div>
              {(meal.proteinG || meal.carbsG || meal.fatG || meal.fiberG) && (
                <p className="mt-2 text-xs text-muted">
                  P {meal.proteinG ?? 0}g · C {meal.carbsG ?? 0}g · F {meal.fatG ?? 0}g · Fiber{" "}
                  {meal.fiberG ?? 0}g
                </p>
              )}
              {meal.items?.length > 0 && (
                <ul className="mt-2 space-y-1 border-t border-border pt-2">
                  {meal.items.map((item, i) => (
                    <li key={i} className="flex justify-between text-xs text-muted">
                      <span>
                        {item.name} · {item.quantity}
                      </span>
                      <span>{item.calories} kcal</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}

          {weightLogs.length > 1 &&
            weightLogs.slice(1).map((w) => (
              <li
                key={w.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-surface p-4"
              >
                <div>
                  <p className="text-xs text-muted">{formatTime(new Date(w.loggedAt))}</p>
                  <p className="text-sm font-medium">
                    {w.weightValue} {w.weightUnit}
                  </p>
                </div>
                <button onClick={() => deleteWeight(w.id)} className="text-muted" aria-label="Delete weight entry">
                  ✕
                </button>
              </li>
            ))}

          {!loading && mealLogs.length === 0 && weightLogs.length === 0 && (
            <li className="py-8 text-center text-sm text-muted">Nothing logged for this day yet.</li>
          )}
        </ul>
      )}

      <button
        onClick={() => openSheet("meal")}
        className="fixed bottom-20 right-6 z-10 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl font-light text-accent-foreground shadow-lg"
        aria-label="Add entry"
      >
        +
      </button>

      {sheetOpen && (
        <AddEntrySheet
          selectedDate={selectedDate}
          defaultTab={sheetTab}
          favorites={favorites}
          onClose={() => setSheetOpen(false)}
          onSaved={() => {
            setSheetOpen(false);
            load(selectedDate);
          }}
        />
      )}

      {editingMeal && (
        <EditMealSheet
          meal={editingMeal}
          onClose={() => setEditingMeal(null)}
          onSaved={() => {
            setEditingMeal(null);
            load(selectedDate);
          }}
        />
      )}
    </div>
  );
}
