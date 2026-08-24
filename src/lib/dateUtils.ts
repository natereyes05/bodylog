import { format, isToday, isYesterday, startOfDay, endOfDay, addDays } from "date-fns";

export function toDateInputValue(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function toTimeInputValue(date: Date): string {
  return format(date, "HH:mm");
}

export function combineDateAndTime(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}:00`);
}

export function dayRange(date: Date): { from: Date; to: Date } {
  return { from: startOfDay(date), to: endOfDay(date) };
}

export function shiftDay(date: Date, amount: number): Date {
  return addDays(date, amount);
}

export function friendlyDayLabel(date: Date): string {
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, "EEEE, MMM d");
}

export function formatTime(date: Date): string {
  return format(date, "h:mm a");
}
