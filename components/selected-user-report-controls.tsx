"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  startTransition as startDeferredTransition,
  useDeferredValue,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import { LoadingOverlay } from "@/components/loading-overlay";

export type SelectedUserReportControlOption = {
  profile_id: string;
  user_label: string;
  email: string | null;
  total_votes: number;
};

type ProfileSearchResult = {
  profile_id: string;
  user_label: string;
  email: string | null;
};

type SelectedUserReportControlsProps = {
  selectedUsers: SelectedUserReportControlOption[];
};

const getUniqueIds = (ids: string[]) => {
  const seen = new Set<string>();
  const nextIds: string[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }

    seen.add(id);
    nextIds.push(id);
  }

  return nextIds;
};

const getSearchResultSubtitle = (result: ProfileSearchResult) =>
  result.email && result.email !== result.user_label ? result.email : "No email on file";

const getSelectedUserLabel = (user: SelectedUserReportControlOption) =>
  user.email && user.email !== user.user_label ? `${user.user_label} (${user.email})` : user.user_label;

export function SelectedUserReportControls({
  selectedUsers,
}: SelectedUserReportControlsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startNavigationTransition] = useTransition();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProfileSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim());
  const searchInputId = useId();
  const modalTitleId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const selectedUserIds = new Set(selectedUsers.map((user) => user.profile_id));

  const buildHref = (nextSelectedIds: string[]) => {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("userId");

    for (const userId of nextSelectedIds) {
      nextParams.append("userId", userId);
    }

    const query = nextParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  };

  const navigateToSelection = (nextSelectedIds: string[]) => {
    const href = buildHref(nextSelectedIds);
    const currentQuery = searchParams.toString();
    const currentHref = currentQuery ? `${pathname}?${currentQuery}` : pathname;
    if (href === currentHref) {
      return;
    }

    startNavigationTransition(() => {
      router.push(href);
    });
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError(null);
    setIsSearching(false);
  };

  const openModal = () => {
    if (isPending) {
      return;
    }

    setIsModalOpen(true);
  };

  const handleAddUser = (profileId: string) => {
    if (isPending) {
      return;
    }

    navigateToSelection(getUniqueIds([...selectedUsers.map((user) => user.profile_id), profileId]));
    closeModal();
  };

  const handleRemoveUser = (profileId: string) => {
    if (isPending) {
      return;
    }

    navigateToSelection(selectedUsers.map((user) => user.profile_id).filter((id) => id !== profileId));
  };

  const handleClearAll = () => {
    if (isPending || selectedUsers.length === 0) {
      return;
    }

    navigateToSelection([]);
  };

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    searchInputRef.current?.focus();
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isModalOpen]);

  useEffect(() => {
    if (!isModalOpen) {
      return;
    }

    if (deferredSearchQuery.length < 2) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }

    const abortController = new AbortController();
    let isActive = true;

    const runSearch = async () => {
      try {
        setIsSearching(true);
        setSearchError(null);

        const response = await fetch(
          `/api/profile-search?q=${encodeURIComponent(deferredSearchQuery)}`,
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error ?? `Search failed with status ${response.status}`);
        }

        const payload = (await response.json()) as { results?: ProfileSearchResult[] };
        if (!isActive) {
          return;
        }

        startDeferredTransition(() => {
          setSearchResults(payload.results ?? []);
        });
      } catch (error) {
        if (!isActive || abortController.signal.aborted) {
          return;
        }

        setSearchResults([]);
        setSearchError(error instanceof Error ? error.message : "Unable to search profiles.");
      } finally {
        if (isActive) {
          setIsSearching(false);
        }
      }
    };

    void runSearch();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [deferredSearchQuery, isModalOpen]);

  const modal =
    isModalOpen && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[2147483646] bg-slate-950/46 p-4 backdrop-blur-sm"
            onClick={closeModal}
          >
            <div className="flex min-h-full items-center justify-center">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby={modalTitleId}
                className="app-card max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="border-b border-slate-200/70 p-4 dark:border-slate-700/70">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="app-kicker text-xs font-semibold uppercase tracking-[0.22em]">
                        Profiles Search
                      </p>
                      <h3 id={modalTitleId} className="mt-1 text-xl font-semibold">
                        Add User
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={closeModal}
                      className="app-button rounded-md px-3 py-2 text-sm font-medium transition"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="space-y-4 p-4">
                  <label className="app-muted space-y-1 text-sm">
                    <span className="block">Search profiles</span>
                    <input
                      id={searchInputId}
                      ref={searchInputRef}
                      type="search"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search by name or email"
                      className="app-input h-10 w-full rounded-md px-3 text-sm outline-none"
                    />
                  </label>

                  <p className="app-muted text-xs">
                    Searches the <code>profiles</code> table. Users with no votes in this study
                    can still be added and will appear with 0 votes.
                  </p>

                  <div className="max-h-[24rem] space-y-2 overflow-y-auto pr-1">
                    {deferredSearchQuery.length < 2 ? (
                      <article className="app-card rounded-xl p-4">
                        <p className="app-muted text-sm">
                          Type at least 2 characters to search profiles.
                        </p>
                      </article>
                    ) : searchError ? (
                      <article className="app-card rounded-xl p-4">
                        <p className="text-sm text-rose-700 dark:text-rose-300">{searchError}</p>
                      </article>
                    ) : isSearching ? (
                      <article className="app-card rounded-xl p-4">
                        <p className="app-muted text-sm">Searching profiles...</p>
                      </article>
                    ) : searchResults.length > 0 ? (
                      searchResults.map((result) => {
                        const alreadySelected = selectedUserIds.has(result.profile_id);

                        return (
                          <article
                            key={result.profile_id}
                            className="app-card flex flex-wrap items-center justify-between gap-3 rounded-xl p-4"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">{result.user_label}</p>
                              <p className="app-muted truncate text-sm">
                                {getSearchResultSubtitle(result)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleAddUser(result.profile_id)}
                              disabled={alreadySelected || isPending}
                              className="app-button rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {alreadySelected ? "Added" : "Add"}
                            </button>
                          </article>
                        );
                      })
                    ) : (
                      <article className="app-card rounded-xl p-4">
                        <p className="app-muted text-sm">No matching profiles found.</p>
                      </article>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <section className="app-card space-y-4 rounded-xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Selected Users</h2>
            <p className="app-muted text-sm">
              Use the modal to search the <code>profiles</code> table and add users to this
              report.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openModal}
              disabled={isPending}
              className="app-button rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add user
            </button>
            <button
              type="button"
              onClick={handleClearAll}
              disabled={isPending || selectedUsers.length === 0}
              className="app-button rounded-md px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              Clear all
            </button>
          </div>
        </div>

        {selectedUsers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {selectedUsers.map((user) => (
              <button
                key={user.profile_id}
                type="button"
                onClick={() => handleRemoveUser(user.profile_id)}
                disabled={isPending}
                className="app-button rounded-full px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60"
              >
                {getSelectedUserLabel(user)} x
              </button>
            ))}
          </div>
        ) : (
          <p className="app-muted text-sm">
            No users selected yet. Click <span className="font-semibold text-foreground">Add user</span> to start the report.
          </p>
        )}
      </section>

      {modal}
      {isPending ? <LoadingOverlay /> : null}
    </>
  );
}
