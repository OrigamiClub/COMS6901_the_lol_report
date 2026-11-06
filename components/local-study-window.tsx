"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

const formatLocalDateTime = (value: string | null) => {
  if (value === null) {
    return "n/a";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
  }).format(date);
};

export function LocalStudyWindow({
  start,
  end,
}: {
  start: string | null;
  end: string | null;
}) {
  const isHydrated = useSyncExternalStore(subscribe, () => true, () => false);

  if (!isHydrated) {
    return <span aria-label="Loading study window">&mdash;</span>;
  }

  return (
    <span>
      {formatLocalDateTime(start)} &ndash; {formatLocalDateTime(end)}
    </span>
  );
}
