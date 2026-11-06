"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Search, Bell, LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSwitcher } from "@/components/app-switcher";
import { signOutAction } from "@/app/actions/auth";
import type { User } from "@supabase/supabase-js";

interface TopNavbarClientProps {
  user: User | null;
  siteTitle: string;
}

export function TopNavbarClient({ user, siteTitle }: TopNavbarClientProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const SEARCH_PAGES = [
    { label: "Dashboard Overview", value: "/", category: "Pages" },
    { label: "Study-to-Study Comparison", value: "/reports/study-comparison", category: "Reports" },
    { label: "Weekly Humor Study Summary", value: "/reports/weekly-study-summary", category: "Reports" },
  ];

  const filteredSearchPages = SEARCH_PAGES.filter(p =>
    p.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
      if (notificationsRef.current && !notificationsRef.current.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedSearchIndex((prev) =>
        prev < filteredSearchPages.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedSearchIndex((prev) =>
        prev > 0 ? prev - 1 : filteredSearchPages.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredSearchPages[selectedSearchIndex]) {
        handleSelectPage(filteredSearchPages[selectedSearchIndex].value);
      }
    } else if (e.key === "Escape") {
      setSearchOpen(false);
    }
  };

  const handleSelectPage = (path: string) => {
    router.push(path);
    setSearchOpen(false);
    setSearchQuery("");
  };

  return (
    <div className="relative">
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur px-6 py-3 select-none">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          {/* Left Side: Branding */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-sm font-bold text-white shadow">
              LR
            </div>
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-foreground sm:text-sm">
              {siteTitle}
            </span>
          </div>

          {/* Middle Corner - Search Bar */}
          <div 
            onClick={() => setSearchOpen(true)}
            className="hidden max-w-xs flex-1 md:block relative mx-4 cursor-pointer hover:opacity-80 transition-opacity"
          >
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-muted-foreground" />
            </div>
            <input
              type="text"
              placeholder="Search reports (Press ⌘K)"
              className="h-9 w-full rounded-lg border border-border bg-muted/40 pl-9 pr-3 text-xs focus:outline-none cursor-pointer text-foreground"
              readOnly
            />
          </div>

          {/* Right Side: Actions */}
          <div className="flex items-center gap-3">
            <ThemeToggle />
            
            <span
              aria-hidden="true"
              className="hidden h-6 w-px bg-border/50 sm:block"
            />

            {/* Notifications */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted/80 transition-colors relative focus:outline-none text-foreground"
              >
                <Bell className="h-4 w-4" />
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              </button>
              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-border bg-background p-4 shadow-2xl focus:outline-none z-50">
                  <div className="flex items-center justify-between border-b pb-2 mb-2">
                    <span className="font-semibold text-xs text-foreground">Notifications</span>
                    <span className="text-[10px] text-indigo-500 font-medium cursor-pointer hover:underline">Mark all read</span>
                  </div>
                  <div className="space-y-3">
                    <div className="text-[11px] leading-tight text-muted-foreground">
                      <p className="font-semibold text-foreground">Weekly report compiled</p>
                      <p className="mt-0.5">Stats computed successfully for Study #7</p>
                      <span className="text-[9px] text-muted-foreground">20 mins ago</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <AppSwitcher />
            {user ? (
              <>
                <span
                  aria-hidden="true"
                  className="hidden h-6 w-px bg-border/50 sm:block"
                />
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-lg border border-border/80 bg-secondary px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-secondary-foreground shadow hover:bg-secondary/80 transition"
                    title="Sign out"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    <span className="hidden sm:inline">Sign out</span>
                  </button>
                </form>
              </>
            ) : null}
          </div>
        </div>
      </header>

      {/* Command Search Overlay Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4">
          <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
          <div
            ref={searchContainerRef}
            className="relative w-full max-w-lg rounded-xl border border-border bg-background p-0 shadow-2xl overflow-hidden flex flex-col max-h-[60vh] z-50"
          >
            <div className="flex items-center border-b px-3 py-1 bg-muted/20">
              <Search className="h-4 w-4 mr-2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedSearchIndex(0);
                }}
                onKeyDown={handleSearchKeyDown}
                placeholder="Type a report name or category to search..."
                className="h-11 w-full bg-transparent text-xs focus:outline-none text-foreground"
                autoFocus
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground hover:bg-muted/80"
              >
                ESC
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {filteredSearchPages.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No matching reports found.
                </div>
              ) : (
                filteredSearchPages.map((page, index) => {
                  const isSelected = index === selectedSearchIndex;
                  return (
                    <button
                      key={page.value}
                      onClick={() => handleSelectPage(page.value)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                        isSelected 
                          ? "bg-primary text-primary-foreground shadow"
                          : "text-foreground hover:bg-muted"
                      }`}
                    >
                      <span>{page.label}</span>
                      <span className={`text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        isSelected ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        {page.category}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
