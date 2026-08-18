import { integerFrom, textFrom } from "./mirror";

/**
 * TMDB's responses → the three things title detail shows and never stores.
 *
 * ADR-0001's metadata caching policy draws a line down the middle of TMDB's fields, and
 * `tmdb/mirror.ts` owns the left-hand column — name, kind, release year, poster path,
 * `in_production`, runtime, every episode's number, name and air date. **This file owns
 * the right-hand column**: synopsis, cast and crew, and watch providers. Nothing here is
 * written to Postgres, which is also why nothing here is keyed by `tmdb_id` the way a
 * mirror row is — a caller asks fresh, every time, and gets a plain value back.
 *
 * Split from `mirror.ts` rather than added to it for the same reason that file gives for
 * staying pure and narrow: mixing "what gets stored" and "what never does" in one module
 * is how a later edit adds a stored column for a field this file was supposed to keep
 * live-only. Two files, two contracts, and a reviewer can tell which one a diff touches.
 *
 * Same shape as `mirror.ts` besides: the network call is `tmdb/catalogue.ts`'s job and is
 * deliberately untested there, the mapping is pure and is tested here
 * (`tests/tmdb-live-facts.test.ts`), against captured responses.
 */

export interface TmdbOverviewPayload {
  overview?: string | null;
}

export interface TmdbCastMemberPayload {
  id?: number;
  name?: string;
  character?: string | null;
  /** TMDB's own billing order. Lower is higher-billed. */
  order?: number;
}

export interface TmdbCrewMemberPayload {
  id?: number;
  name?: string;
  job?: string | null;
}

export interface TmdbCreditsPayload {
  cast?: TmdbCastMemberPayload[];
  crew?: TmdbCrewMemberPayload[];
}

export interface TmdbWatchProviderPayload {
  provider_id?: number;
  provider_name?: string;
  logo_path?: string | null;
}

export interface TmdbWatchProviderRegionPayload {
  flatrate?: TmdbWatchProviderPayload[];
  free?: TmdbWatchProviderPayload[];
  ads?: TmdbWatchProviderPayload[];
}

export interface TmdbWatchProvidersPayload {
  results?: Record<string, TmdbWatchProviderRegionPayload>;
}

/** `null` when TMDB has not written one, or has written the empty string. */
export function synopsisFrom(payload: TmdbOverviewPayload): string | null {
  return textFrom(payload.overview);
}

export interface CastMember {
  readonly id: number;
  readonly name: string;
  /** `null` when TMDB has no character name for this credit — an interview subject,
   *  a documentary's participants, a voice role TMDB has not captioned. */
  readonly character: string | null;
}

/**
 * Never a spreadsheet (`SPEC.md` §7's top-ranked principle): the whole cast list can run
 * to hundreds of names, so this is the lead billing and nothing past it.
 */
const MAX_CAST = 8;

/** The lead cast, TMDB's own billing order, deduplicated by person. */
export function castFrom(payload: TmdbCreditsPayload): readonly CastMember[] {
  const seen = new Set<number>();
  const cast: CastMember[] = [];

  for (const member of [...(payload.cast ?? [])].sort(byBillingOrder)) {
    const id = integerFrom(member.id);
    if (id === null || !member.name || seen.has(id)) continue;
    seen.add(id);
    cast.push({ id, name: member.name, character: textFrom(member.character) });
    if (cast.length >= MAX_CAST) break;
  }

  return cast;
}

function byBillingOrder(a: TmdbCastMemberPayload, b: TmdbCastMemberPayload): number {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
}

export interface CrewMember {
  readonly id: number;
  readonly name: string;
  readonly job: string;
}

/**
 * The jobs worth naming on a page about the title rather than the episode — the people a
 * reader of the season's programme would expect a programme to credit. Everyone else on
 * `credits.crew` (the gaffer, the colourist, the second assistant editor) is real and is
 * not what this section is for.
 */
const LEAD_CREW_JOBS = new Set(["Director", "Creator", "Writer"]);
const MAX_CREW = 4;

/** One credit per person — first (highest-billed) job wins — capped at `MAX_CREW`. */
export function crewFrom(payload: TmdbCreditsPayload): readonly CrewMember[] {
  const seen = new Set<number>();
  const crew: CrewMember[] = [];

  for (const member of payload.crew ?? []) {
    const id = integerFrom(member.id);
    if (id === null || !member.name || !member.job) continue;
    if (!LEAD_CREW_JOBS.has(member.job)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    crew.push({ id, name: member.name, job: member.job });
    if (crew.length >= MAX_CREW) break;
  }

  return crew;
}

export interface WatchProvider {
  readonly id: number;
  readonly name: string;
  readonly logoPath: string | null;
}

/**
 * Where this title can be **streamed**, in one region. CONTEXT.md's glossary: *"a
 * service a title can be streamed on"* — so this reads `flatrate`, `free` and `ads`
 * (TMDB's three subscription-shaped buckets) and never `buy` or `rent`, which are a
 * transaction MediaSafe has no record of and no view onto.
 *
 * `region` is an ISO 3166-1 country code — TMDB keys `results` by one. There is no
 * region on `user` today (MediaSafe is single-account), so the caller supplies a fixed
 * default; see `tmdb/catalogue.ts`.
 */
export function watchProvidersFrom(
  payload: TmdbWatchProvidersPayload,
  region: string,
): readonly WatchProvider[] {
  const forRegion = payload.results?.[region];
  if (!forRegion) return [];

  const seen = new Set<number>();
  const providers: WatchProvider[] = [];

  for (const provider of [
    ...(forRegion.flatrate ?? []),
    ...(forRegion.free ?? []),
    ...(forRegion.ads ?? []),
  ]) {
    const id = integerFrom(provider.provider_id);
    if (id === null || !provider.provider_name || seen.has(id)) continue;
    seen.add(id);
    providers.push({
      id,
      name: provider.provider_name,
      logoPath: textFrom(provider.logo_path),
    });
  }

  return providers;
}
