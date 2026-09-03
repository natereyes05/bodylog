export interface WeightLogDTO {
  id: string;
  loggedAt: string;
  weightValue: number;
  weightUnit: string;
}

export interface MealItemDTO {
  name: string;
  quantity: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export interface MealLogDTO {
  id: string;
  loggedAt: string;
  rawText: string;
  items: MealItemDTO[];
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
  userEdited: boolean;
}

export interface FavoriteMealDTO {
  id: string;
  rawText: string;
  items: MealItemDTO[];
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  fiberG: number | null;
}

export interface ProfileDTO {
  name: string | null;
  email: string;
  calorieGoal: number | null;
  proteinGoalG: number | null;
  carbsGoalG: number | null;
  fatGoalG: number | null;
  fiberGoalG: number | null;
  locationHint: string | null;
}
