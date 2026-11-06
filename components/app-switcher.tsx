"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

const APPS = [
  { id: "chucklesome", name: "Chucklesome", description: "Admin Area" },
  { id: "toosoon", name: "Too Soon", description: "Matrix" },
  { id: "lolreport", name: "The LOL Report", description: "Stats" },
  { id: "puniversity", name: "Student Brain", description: "Puniversity" },
];

export function AppSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getAppUrl = (appId: string) => {
    if (!mounted || typeof window === "undefined") return "#";
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1";
    const isStaging = host.includes("almostcrackd.ai") || host.includes("slightlyhumorous.org");

    if (isLocal) {
      switch (appId) {
        case "chucklesome": return "http://localhost:3001";
        case "toosoon": return "http://localhost:3003";
        case "lolreport": return "http://localhost:3007";
        case "puniversity": return "http://localhost:3000";
      }
    }

    if (isStaging) {
      switch (appId) {
        case "chucklesome": return "https://admin.almostcrackd.ai";
        case "toosoon": return "https://matrix.almostcrackd.ai";
        case "lolreport": return "https://stats.slightlyhumorous.org";
        case "puniversity": return "https://brain.almostcrackd.ai";
      }
    }

    // Production fallback
    switch (appId) {
      case "chucklesome": return "https://admin.crackd.ai";
      case "toosoon": return "https://matrix.crackd.ai";
      case "lolreport": return "https://stats.humorstudy.org";
      case "puniversity": return "https://brain.crackd.ai";
    }
    return "#";
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
        aria-label="App Switcher"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="7" height="7" x="3" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="3" rx="1" />
          <rect width="7" height="7" x="14" y="14" rx="1" />
          <rect width="7" height="7" x="3" y="14" rx="1" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl focus:outline-none z-50 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="border-b border-zinc-100 bg-zinc-50/50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/50">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Apps</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3">
            {APPS.map((app) => (
              <Link
                key={app.name}
                href={getAppUrl(app.id)}
                className="flex flex-col items-center justify-center rounded-lg border border-zinc-100 bg-white p-4 text-center transition-all hover:border-zinc-300 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-zinc-900 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                onClick={() => setIsOpen(false)}
              >
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{app.name}</span>
                <span className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{app.description}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
