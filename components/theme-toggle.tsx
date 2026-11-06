"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const themeOptions = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  if (!mounted) {
    return (
      <div className="app-card h-9 w-28 rounded-md" />
    );
  }

  return (
    <label className="app-muted flex items-center gap-2 text-xs font-medium">
      Theme
      <select
        aria-label="Select theme"
        className="app-input h-9 rounded-md px-2 text-sm outline-none transition"
        onChange={(event) => setTheme(event.target.value)}
        value={theme ?? "system"}
      >
        {themeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
