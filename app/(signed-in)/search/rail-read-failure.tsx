"use client";

import { useRouter } from "next/navigation";

import { ReadFailure } from "@/errors/read-failure";

/**
 * The *Because you watched* rail's failure, with a retry that actually retries.
 *
 * ── Why this thin client component exists ───────────────────────────────────────────
 *
 * The rail is server-rendered, so it has no client-side read to run again — and
 * `ReadFailure` takes a required `retry` because its copy tells the reader to *try again*.
 * A failure surface with no way out is a worse thing than an extra file.
 *
 * Loosening `ReadFailure` to make `retry` optional was the other option and was rejected.
 * It is the one surface `SPEC.md` §6 and `DESIGN.md`'s States section pin down hardest,
 * shared by every failing region in the application, and making its recovery control
 * optional would let the *next* caller drop it by omission rather than by decision.
 *
 * `router.refresh()` re-runs the server render of this route, which re-runs
 * `readRecommendations` — a real retry of the read that failed, not a reset of some local
 * state. It costs the rest of the screen a re-render, which on this screen is a field and
 * a dim line; the search phase lives in `SearchSurface`'s own state and survives it,
 * because a refresh re-renders Server Components without remounting the client tree.
 */
export function RailReadFailure({ reference }: { reference: string | null }) {
  const router = useRouter();

  return <ReadFailure reference={reference} retry={() => router.refresh()} />;
}
