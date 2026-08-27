"use client";

import { useState } from "react";
import { combineDateAndTime, toDateInputValue, toTimeInputValue } from "@/lib/dateUtils";
import type { FavoriteMealDTO } from "@/lib/types";

type Tab = "weight" | "meal";

export default function AddEntrySheet({
  selectedDate,
  defaultTab,
  favorites,
  onClose,
  onSaved,
}: {
  selectedDate: Date;
  defaultTab: Tab;
  favorites: FavoriteMealDTO[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [date, setDate] = useState(toDateInputValue(selectedDate));
  const [time, setTime] = useState(toTimeInputValue(new Date()));
  const [weightValue, setWeightValue] = useState("");
  const [weightUnit, setWeightUnit] = useState<"lb" | "kg">("lb");
  const [mealText, setMealText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitWeight = async () => {
    setError(null);
    const value = Number(weightValue);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid weight.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loggedAt: combineDateAndTime(date, time).toISOString(),
        weightValue: value,
        weightUnit,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save that.");
      return;
    }
    onSaved();
  };

  const submitFavorite = async (favoriteId: string) => {
    if (!favoriteId) return;
    setError(null);
    setLoading(true);
    const res = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loggedAt: combineDateAndTime(date, time).toISOString(),
        favoriteId,
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save that.");
      return;
    }
    onSaved();
  };

  const submitMeal = async () => {
    setError(null);
    if (!mealText.trim()) {
      setError("Describe what you ate.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loggedAt: combineDateAndTime(date, time).toISOString(),
        rawText: mealText.trim(),
      }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save that.");
      return;
    }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/40">
      <div className="w-full max-w-lg rounded-t-3xl bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" />

        <div className="mb-4 flex rounded-xl bg-background p-1">
          <button
            onClick={() => setTab("weight")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${
              tab === "weight" ? "bg-accent text-accent-foreground" : "text-muted"
            }`}
          >
            Weight
          </button>
          <button
            onClick={() => setTab("meal")}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${
              tab === "meal" ? "bg-accent text-accent-foreground" : "text-muted"
            }`}
          >
            Meal
          </button>
        </div>

        <div className="mb-4 flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-muted">Time</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-base outline-none focus:border-accent"
            />
          </div>
        </div>

        {tab === "weight" ? (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Weight</label>
              <div className="flex gap-3">
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  autoFocus
                  placeholder="0.0"
                  value={weightValue}
                  onChange={(e) => setWeightValue(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-lg outline-none focus:border-accent"
                />
                <div className="flex overflow-hidden rounded-xl border border-border">
                  {(["lb", "kg"] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setWeightUnit(u)}
                      className={`px-4 text-sm font-medium ${
                        weightUnit === u ? "bg-accent text-accent-foreground" : "bg-background text-muted"
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              onClick={submitWeight}
              disabled={loading}
              className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-60"
            >
              {loading ? "Saving…" : "Log weight"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {favorites.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">
                  Quick add from favorites
                </label>
                <select
                  defaultValue=""
                  disabled={loading}
                  onChange={(e) => submitFavorite(e.target.value)}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent"
                >
                  <option value="" disabled>
                    Select a saved meal…
                  </option>
                  {favorites.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.rawText.length > 60 ? `${f.rawText.slice(0, 60)}…` : f.rawText}
                      {f.calories != null ? ` (${f.calories} kcal)` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">
                What did you eat?
              </label>
              <textarea
                autoFocus
                rows={3}
                placeholder="e.g. two scrambled eggs, a slice of toast with butter, and a black coffee"
                value={mealText}
                onChange={(e) => setMealText(e.target.value)}
                className="w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent"
              />
              <p className="mt-1 text-xs text-muted">
                Just describe it naturally — AI will estimate calories and macros.
              </p>
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              onClick={submitMeal}
              disabled={loading}
              className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-60"
            >
              {loading ? "Analyzing meal…" : "Log meal"}
            </button>
          </div>
        )}

        <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
