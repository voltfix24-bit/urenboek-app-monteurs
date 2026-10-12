# AGENTS.md

- Never put real sales prices (tarieven) in client code, fixtures or `public/` assets; load them only from manager-only `spec_code_tarieven` via `loadSpecCodes`, which throws instead of falling back. Why: the JS bundle and public files are readable by anyone.
- The prijzenblad Excel template in `public/templates` stays price-free; prices are filled in client-side only after an authorised fetch, and the export aborts when that fetch fails. Why: the template is publicly downloadable.
- `projects` uses column-level grants: `authenticated` may only SELECT the whitelist in `PROJECT_SAFE_COLUMNS`; managers read sensitive columns via the `get_projects_admin_v1()` RPC (`adminProjects()`). Why: RLS cannot hide columns, so monteurs would otherwise see client/contact/sync data.
- Planner sync RPCs (`*_planner_planning_*_v1` write functions) are executable by `service_role` only; Edge Functions do the manager check first. Why: prevents direct calls with a user JWT.
- Desktop `/manager-planning` (lg+) writes to `planning_concept`; only the `publiceer_planning` RPC moves concepts into `planning` and it skips Planner-protected rows. Why: monteurs and hour booking read `planning` only, so drafts stay invisible until published.
- The legacy project matrix (`ProjectPlanning`) never writes to or deletes from `planning`; only the weekplanning concept flow publishes. Why: the matrix used to wipe all project planning on (re)publish.
