const formatUnit = (value: number, singular: string) =>
  `${value} ${value === 1 ? singular : `${singular}s`}`;

export const formatDurationFromMinutes = (value: number | null | undefined) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "n/a";
  }

  const totalSeconds = Math.max(0, Math.round(value * 60));

  if (totalSeconds < 60) {
    return formatUnit(totalSeconds, "second");
  }

  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);

  if (totalMinutes < 60) {
    return `${formatUnit(totalMinutes, "minute")} ${formatUnit(seconds, "second")}`;
  }

  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${formatUnit(hours, "hour")} ${formatUnit(minutes, "minute")} ${formatUnit(seconds, "second")}`;
};
