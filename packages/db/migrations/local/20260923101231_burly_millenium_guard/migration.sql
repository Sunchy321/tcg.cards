-- Hand-qualified: the generator emitted this one index unqualified, while its
-- own snapshot records it under "magic_data". Unqualified, the statement only
-- resolves when the session's search path happens to include that schema, so
-- the chain cannot reach a fresh database.
DROP INDEX "magic_data"."print_commits_status_idx";--> statement-breakpoint
ALTER TABLE "magic_data"."print_commits" DROP COLUMN "status";