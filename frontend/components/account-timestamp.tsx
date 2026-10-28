"use client";

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

export function AccountTimestamp({ value, empty = 'Not available' }: { value: string | null | undefined; empty?: string }) {
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  if (!value) return <>{empty}</>;
  if (!hydrated) return <time dateTime={value}>{value}</time>;
  return <time dateTime={value}>{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))}</time>;
}
