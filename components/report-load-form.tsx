"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, type KeyboardEvent, type ReactNode, useTransition } from "react";

import { LoadingOverlay } from "@/components/loading-overlay";

type ReportLoadFormProps = {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  pathBuilder?: {
    fieldName: string;
    prefix: string;
    suffix?: string;
  };
};

export function ReportLoadForm({
  children,
  className,
  disabled = false,
  pathBuilder,
}: ReportLoadFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || isPending) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    const formData = new FormData(event.currentTarget);
    const fieldNames = new Set<string>();
    let nextPathname = pathname;
    let pathFieldValue: string | null = null;

    for (const [key] of formData.entries()) {
      fieldNames.add(key);
    }

    for (const name of fieldNames) {
      nextParams.delete(name);
    }

    for (const [key, value] of formData.entries()) {
      if (typeof value !== "string") {
        continue;
      }

      const trimmedValue = value.trim();
      if (pathBuilder && key === pathBuilder.fieldName) {
        pathFieldValue = trimmedValue.length === 0 ? null : trimmedValue;
        continue;
      }

      if (trimmedValue.length === 0) {
        continue;
      }

      nextParams.append(key, trimmedValue);
    }

    if (pathBuilder) {
      if (pathFieldValue === null) {
        return;
      }

      const normalizedPrefix = pathBuilder.prefix.endsWith("/")
        ? pathBuilder.prefix.slice(0, -1)
        : pathBuilder.prefix;
      const normalizedSuffix = pathBuilder.suffix
        ? `/${pathBuilder.suffix.replace(/^\/+/, "")}`
        : "";
      nextPathname = `${normalizedPrefix}/${encodeURIComponent(pathFieldValue)}${normalizedSuffix}`;
    }

    const nextQuery = nextParams.toString();
    if (nextPathname === pathname && nextQuery === searchParams.toString()) {
      return;
    }

    const href = nextQuery ? `${nextPathname}?${nextQuery}` : nextPathname;

    startTransition(() => {
      router.push(href);
    });
  };

  const handleChange = (event: FormEvent<HTMLFormElement>) => {
    if (!(event.target instanceof HTMLSelectElement)) {
      return;
    }

    if (!pathBuilder || event.target.name !== pathBuilder.fieldName) {
      return;
    }

    event.currentTarget.requestSubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if (event.key !== "Enter") {
      return;
    }

    if (!(event.target instanceof HTMLInputElement)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.requestSubmit();
  };

  return (
    <>
      <form
        method="get"
        action={pathname}
        onSubmit={handleSubmit}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        className={className}
        aria-busy={isPending}
      >
        {children}
      </form>
      {isPending ? <LoadingOverlay /> : null}
    </>
  );
}
