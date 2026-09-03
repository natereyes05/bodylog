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
  const [locationHint, setLocationHint] = useState("");
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
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
          setLocationHint(data.locationHint ?? "");
        }
        setLoading(false);
      });
  }, []);

  const useCurrentLocation = () => {
    setLocationError(null);
    if (!navigator.geolocation) {
      setLocationError("Your browser doesn't support location access.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const res = await fetch("/api/profile/geocode", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            setLocationError(data.error ?? "Couldn't determine your location.");
            return;
          }
          setLocationHint(data.locationHint);
        } catch {
          setLocationError("Couldn't determine your location.");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocationError("Location access was denied — you can still type it in manually.");
        setLocating(false);
      },
    );
  };

  const save = async () => {
    setError(null);
    setSaved(false);
    setSaving(true);
    const body: Record<GoalKey, number | null> & { locationHint: string | null } = {
      locationHint: locationHint.trim() || null,
    } as Record<GoalKey, number | null> & { locationHint: string | null };
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
          <div className="rounded-2xl border border-border bg-surface p-4">
            <label htmlFor="locationHint" className="mb-1 block text-sm font-medium text-muted">
              Location
            </label>
            <p className="mb-2 text-xs text-muted">
              Used to anchor restaurant nutrition searches toward nearby results (e.g. so &ldquo;PB Sushi&rdquo;
              finds the right one).
            </p>
            <div className="flex items-center gap-2">
              <input
                id="locationHint"
                type="text"
                placeholder="e.g. San Diego, CA"
                value={locationHint}
                onChange={(e) => setLocationHint(e.target.value)}
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-base outline-none focus:border-accent"
              />
              <button
                onClick={useCurrentLocation}
                disabled={locating}
                className="shrink-0 rounded-xl border border-border px-3 py-2.5 text-sm font-medium text-accent disabled:opacity-60"
              >
                {locating ? "Locating…" : "📍 Use current"}
              </button>
            </div>
            {locationError && <p className="mt-2 text-xs text-danger">{locationError}</p>}
          </div>

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
            {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
      )}
    </div>
  );
}
