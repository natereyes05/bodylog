"use client";

import { useState } from "react";
import type { MealItemDTO, MealLogDTO } from "@/lib/types";

export default function EditMealSheet({
  meal,
  onClose,
  onSaved,
}: {
  meal: MealLogDTO;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<MealItemDTO[]>(() => meal.items.map((i) => ({ ...i })));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const updateItem = <K extends keyof MealItemDTO>(index: number, key: K, value: MealItemDTO[K]) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { name: "", quantity: "", calories: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0 },
    ]);
  };

  const totalCalories = items.reduce((sum, i) => sum + (Number(i.calories) || 0), 0);

  const save = async () => {
    setError(null);
    const trimmed = items.map((i) => ({ ...i, name: i.name.trim(), quantity: i.quantity.trim() }));
    if (trimmed.length === 0 || trimmed.some((i) => !i.name)) {
      setError("Every item needs a name.");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/meals?id=${meal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: trimmed }),
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
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-border" />

        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Edit meal</h2>
          <span className="text-sm font-medium text-muted">{totalCalories} kcal</span>
        </div>

        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl border border-border p-3">
              <div className="mb-2 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Food name"
                  value={item.name}
                  onChange={(e) => updateItem(i, "name", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
                <button
                  onClick={() => removeItem(i)}
                  className="shrink-0 text-muted"
                  aria-label="Remove item"
                >
                  ✕
                </button>
              </div>
              <input
                type="text"
                placeholder="Quantity (e.g. 6 oz)"
                value={item.quantity}
                onChange={(e) => updateItem(i, "quantity", e.target.value)}
                className="mb-2 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              />
              <div className="grid grid-cols-5 gap-2">
                {(
                  [
                    ["calories", "kcal"],
                    ["proteinG", "P"],
                    ["carbsG", "C"],
                    ["fatG", "F"],
                    ["fiberG", "Fiber"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-0.5 block text-[10px] uppercase text-muted">{label}</label>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={item[key]}
                      onChange={(e) => updateItem(i, key, Number(e.target.value))}
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addItem}
          className="mt-3 w-full rounded-xl border border-dashed border-border py-2.5 text-sm text-muted"
        >
          + Add item
        </button>

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}

        <button
          onClick={save}
          disabled={loading}
          className="mt-4 w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-60"
        >
          {loading ? "Saving…" : "Save changes"}
        </button>
        <button onClick={onClose} className="mt-3 w-full py-2 text-sm text-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
