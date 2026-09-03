"use client";

import { useEffect, useState } from "react";
import type { ProfileDTO } from "@/lib/types";

type GoalKey = "calorieGoal" | "proteinGoalG" | "carbsGoalG" | "fatGoalG" | "fiberGoalG";

const FIELDS: { key: GoalKey; label: string; unit: string; placeholder: string }[] = [
  { key: "calorieGoal", label: "Calories", unit: "kcal", placeholder: "e.g. 2200" },
  { key: "proteinGoalG", label: "Protein", unit: "g", placeholder: "e.g. 150" },
  { key: "carbsGoalG", label: "Carbs", unit: "g", placeholder: "e.g. 220" },
  { key: "fatGoalG", label: "Fat", unit: "g", placeholder: "e.g. 70" },
  { key: "fiberGoalG", label: "Fiber", unit: "g", placeholder: "e.g. 30" },
];

export default function ProfileView() {
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [values, setValues] = useState<Record<GoalKey, string>>({
    calorieGoal: "",
    proteinGoalG: "",
    carbsGoalG: "",
    fatGoalG: "",
    fiberGoalG: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: ProfileDTO | null) => {
        if (data) {
          setProfile(data);
          setValues({
            calorieGoal: data.calorieGoal?.toString() ?? "",
            proteinGoalG: data.proteinGoalG?.toString() ?? "",
            carbsGoalG: data.carbsGoalG?.toString() ?? "",
            fatGoalG: data.fatGoalG?.toString() ?? "",
            fiberGoalG: data.fiberGoalG?.toString() ?? "",
          });
        }
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    const body: Record<GoalKey, number | null> = {} as Record<GoalKey, number | null>;
    for (const { key } of FIELDS) {
      const raw = values[key].trim();
      body[key] = raw === "" ? null : Number(raw);
    }
    const res = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't save that.");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-4 pb-8">
      {profile && <p className="mb-1 text-sm text-muted">Signed in as {profile.email}</p>}
      <h1 className="mb-1 text-lg font-semibold">Daily nutrition goals</h1>
      <p className="mb-4 text-sm text-muted">
        Set targets for the macros you want to track. Calories, protein, and fiber show up as progress rings on
        Today; leave any field blank to skip tracking it.
      </p>

      {loading ? (
        <p className="py-8 text-center text-sm text-muted">Loading…</p>
      ) : (
        <div className="space-y-3">
          {FIELDS.map(({ key, label, unit, placeholder }) => (
            <div key={key} className="rounded-2xl border border-border bg-surface p-4">
              <label htmlFor={key} className="mb-1 block text-sm font-medium text-muted">
                {label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={key}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  placeholder={placeholder}
                  value={values[key]}
                  onChange={(e) => setValues((prev) => ({ ...prev, [key]: e.target.value }))}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-base outline-none focus:border-accent"
                />
                <span className="shrink-0 text-sm text-muted">{unit}</span>
              </div>
            </div>
          ))}

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-xl bg-accent px-4 py-3 text-base font-medium text-accent-foreground disabled:opacity-60"
          >
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save goals"}
          </button>
        </div>
      )}
    </div>
  );
}
