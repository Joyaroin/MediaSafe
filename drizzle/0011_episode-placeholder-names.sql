-- TMDB names an announced episode "Episode N" until the real name is known. Treated as no
-- name (CONTEXT.md, *Placeholder name*); `episodeNameFrom` in tmdb/mirror.ts stops new ones
-- arriving, and this clears the ones already mirrored. Data only, and idempotent: the
-- refresh writes TMDB's real name over the null once it publishes one.
UPDATE "episode" SET "name" = NULL WHERE "name" ~ '^Episode [0-9]+$';
