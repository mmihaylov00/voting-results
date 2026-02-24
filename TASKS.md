
# Backend + Election System — Tasks

Date format: `YYYY.MM.DD`

## Status Legend
- [ ] Not started
- [~] In progress
- [x] Done

## Scope Decisions
- Existing elections are imported once into the DB and treated as **read-only**.
- Assignment conflicts are **hard-blocked** (one person -> one section -> one role).
- Roles are **global** (not per election).

---

## Milestone 1: Backend Skeleton + Auth
- [x] Initialize NestJS backend structure
- [x] Add module: `auth`
- [x] Add module: `users`
- [x] Add module: `elections-manage`
- [x] Add module: `sections`
- [x] Add module: `people`
- [x] Add module: `roles`
- [x] Add module: `assignments`
- [x] Add module: `elections`
- [x] Add module: `uploads`
- [x] Select ORM and configure DB connection
- [x] Create migration baseline
- [x] Define `users` table
- [x] Define auth role enum on `users` (`admin`, `campaign_manager`, `viewer`)
- [x] Remove auth `user_roles` relation table
- [x] Define managed election table shape in `elections`
- [x] Define `election_sections` table for managed election sections
- [x] Define `people` table
- [x] Define `assignments` table with unique constraint for (person_id, role_id) and (section_id, role_id)
- [x] Define `elections` table
- [x] Define `election_sections` table (read-only stats)
- [x] Define `election_results` table (managed election result uploads)
- [x] Implement RBAC guard for `admin` routes
- [x] Implement RBAC guard for `campaign_manager` routes
- [x] Implement RBAC guard for `viewer` routes (read-only)
- [x] Implement auth endpoints: `POST /auth/login`
- [x] Implement auth endpoints: `POST /auth/logout` (if session-based) or token revoke
- [x] Implement password hashing
- [x] Add JWT auth strategy
- [x] Implement users CRUD endpoints (admin-only)
- [x] Add seed for initial admin user
- [x] Add seed for default roles

## Milestone 2: Election Data Import (Read-only)
- [x] Move raw election data from `frontend/public/data` to `backend/data`
- [x] Define import CLI entry point
- [x] Define canonical election schema in DB tables (normalized fields)
- [ ] Parse `sections.txt` into section metadata
- [ ] Parse `protocols.txt` into totals (voted, paper, machine, invalid)
- [ ] Parse `votes.txt` into party vote totals
- [ ] Parse `preferences.txt` into candidate preference totals
- [ ] Parse `local_candidates.txt` into candidate metadata
- [ ] Parse `cik_parties.txt` into party dictionary
- [ ] Normalize and merge all sources into election DTOs
- [x] Store elections and read-only section stats in DB using explicit columns/tables
- [x] Add import idempotency (skip if date already imported)
- [ ] Add import validation errors with line numbers
- [x] Expose read-only API: elections list
- [x] Expose read-only API: election summary
- [x] Expose read-only API: election sections list
- [x] Expose read-only API: election section detail
- [x] Import raw election `.txt` files and store parsed election payloads into `Election` records
- [x] Import pipeline uses raw files + database only (no persisted generated artifacts)
- [x] Remove persisted `backend/data/compiled` artifacts

## Milestone 3: Election Creation + CSV Upload
- [x] Managed elections list endpoint
- [x] Managed elections create endpoint
- [x] Managed elections update endpoint
- [x] Managed elections delete endpoint
- [x] Managed elections detail endpoint
- [x] Sections CSV upload endpoint
- [x] Sections CSV validation + preview DTO
- [x] Sections CSV mapping and persist
- [x] People CSV upload endpoint
- [x] People CSV validation + preview DTO
- [x] People CSV mapping and persist
- [x] Define import interface for CRM (placeholder)
- [x] Define import interface for CSV (implementation)

## Milestone 4: Assignment + Filtering
- [x] Global roles list endpoint
- [x] Global roles create endpoint
- [x] Global roles update endpoint
- [x] Global roles delete endpoint
- [x] Assignments create endpoint with hard-block validation
- [x] Assignments update endpoint with hard-block validation
- [x] Assignments delete endpoint
- [x] Filter: people without section (by role)
- [x] Filter: sections missing person for role
- [ ] Bulk assignment endpoint (optional)

## Milestone 5: Results Upload + Stats
- [x] Results CSV upload endpoint
- [x] Results CSV validation + preview DTO
- [x] Store results under election + election date
- [x] Compute and persist stats for UI widgets
- [x] Expose API for election results view

## Milestone 6: Frontend Integration
- [x] Add auth flow (login/logout)
- [x] Add protected route guard
- [x] Add user CRUD screen
- [x] Add managed elections list screen
- [x] Add managed elections create/edit screen
- [x] Add sections upload screen
- [x] Add people upload screen
- [x] Add assignments management screen
- [x] Add results upload screen
- [x] Add election results stats screen
- [x] Replace asset-based election loading with backend API calls
- [x] Remove frontend `elections.json` dependency and use DB-backed elections list only
- [x] Serve compact mapping from backend API and consume it in frontend
- [x] Add API base URL configuration support
- [x] Improve upload screens file handling UX
- [x] Protect election routes behind auth
- [x] Add post-login redirect to originally requested route
- [x] Enable backend CORS for frontend and point FE API URL to backend
- [x] Fix CORS for localhost `4200*` (with credentials) and localhost:3200
- [x] Add explicit backend startup/CORS logs for local debugging
- [x] Fully replace campaign naming with election naming in backend/frontend APIs and models

## Milestone 7: Docker Compose + Env
- [x] Add `docker-compose.yml` with `api`, `db`, `frontend`
- [x] Configure Postgres volume
- [x] Add `.env.example`
- [x] Document local run steps
- [x] Recreate baseline migration for election schema and run with `prisma migrate deploy`

## Milestone 8: QA
- [x] Backend build passes (`npm run build`)
- [x] Extract shared CSV base service for sections/people imports
- [x] CSV validators unit tests
- [x] Import pipeline tests for a sample election
- [x] Auth/RBAC tests (admin, campaign_manager, viewer)
- [x] Stats regression checks vs current frontend output
- [x] Create shared package for enums/DTOs reused by frontend and backend
- [x] Replace hardcoded auth RBAC role strings with shared role constants

## Milestone 9: Frontend Page Parity with Backend
- [x] Managed election create/edit page: no date prompt in UI; creation uses auto-generated date/name flow
- [x] Managed elections list: create flow moved to modal with auto-generated date/name (no manual input)
- [x] Managed election detail page: add delete action wired to `DELETE /elections/manage/:id` and remove date editing UI
- [x] Managed elections list: add delete action for campaigns
- [x] Sections upload page: show backend validation errors table (line + message), not only generic error
- [x] People upload page: show backend validation errors table (line + message), not only generic error
- [x] Assignments page: implement create assignment form (person, section, role) wired to `POST /elections/manage/:id/assignments`
- [x] Assignments page: implement assignment edit flow wired to `PATCH /elections/manage/:id/assignments/:assignmentId`
- [x] Assignments page: implement assignment delete action wired to `DELETE /elections/manage/:id/assignments/:assignmentId`
- [x] Assignments page: implement filters for `people-without-section` and `sections-missing-role` endpoints
- [x] Results upload page: show parsed preview rows before submit and backend row-level validation errors
- [x] Results stats page: add actionable views for missing/extra sections from stats response
- [x] Read-only election list page: surface backend election `name` consistently in cards/links/tooltips
- [x] Read-only election detail page: ensure compact mapping endpoint failure fallback is visibly handled (warning + degraded mode)
- [x] Read-only election detail page: load current election first, then background historical data, with no blocking loader after current load
- [x] App shell: add role-based sidebar navigation with only visible tabs for the current user
- [x] App shell: hide sidebar for `viewer` role
- [x] App shell: keep sidebar fixed to viewport (100% height) and non-scrollable
- [x] Roles admin page: add CRUD UI for global roles (`GET/POST/PATCH/DELETE /roles`)
- [x] Viewer role UX: verify all manage pages are strictly read-only or hidden for `viewer`
- [x] Users admin page: reuse existing shared UI components (table/card/input/button) for listing and actions
- [x] Users admin page: move user creation flow into modal
- [x] Users admin page: add sorting, name/role filters, and pagination
- [x] Users admin page: switch pagination controls to shared Spartan-style pagination component
- [x] Optimize election listing requests: backend managed list returns minimal fields (`id`, `date`, `name`)
- [x] Optimize read-only election cards loading: fetch per-election summaries with request deduplication (no global blocking summary preload)
- [x] Re-verify backend/frontend builds after listing performance optimizations
- [x] Remove standalone elections list page and move admin election create/delete controls to home cards (`+` card and trash action)
- [x] Add admin import-state danger banners on election open screens with modal upload actions (sections first, then people)
- [x] Add volunteers management view in election detail (`Доброволци`) with assign/unassign actions and manual person creation
- [x] Add volunteer assignment support in section detail modal with shared assign flow and prefilled section
- [x] Add sections table positions summary column and quick filters for missing assignments by specific/any position
- [x] Add backend endpoint for manual person creation (`POST /elections/manage/:electionId/people`)
- [x] Add modal size variants (`full`/`half`) and use `half` for creation modals
- [x] Move missing-position section filters into the existing quick filters dropdown
- [x] Improve election detail UX: quick filter selection parity, conditional assignee UI visibility, volunteer import CTA, autocomplete assignment inputs, and resilient historical modal data usage
- [x] Replace native assignment selectors with reusable autocomplete inputs (clear button + scrollable dropdown)
- [x] Volunteers table: add dedicated assignment filters dropdown (only unassigned + by position)
- [x] Volunteers table: split position into separate column and render colored position badges
- [x] Keep section details modal open while opening assignment modal on top
- [x] Grouped section/municipality volunteer views: show assignment section details and allow unassign actions
- [x] Avoid redundant managed-data refetch on volunteers tab switch; reload only on explicit refresh actions
- [x] Fix assignment payload mapping (`roleId` -> `positionId`) to restore correct position counts and quick filters
- [x] Restrict assignment modal section options to current selected region (when region filter is active)
- [x] Fix autocomplete dropdown close behavior (toggle on input click + close on select/outside click)
- [x] Add missing action icons to volunteer actions and filters, and render section position counts as colored position badges
- [x] Optimize assign/unassign flow to update local managed state (no full refetch of sections/people/positions/assignments)
- [x] Volunteers assignment filter: switch "Само неразпределени" from checkbox to button-style toggle
- [x] Fix autocomplete typing filter (stable input while typing + match by label/description)
- [x] Unassign updates volunteer status/position immediately in local state (including duplicate-person safety)
- [x] Move "Само неразпределени" toggle next to the other assignment filter buttons
- [x] Add assignment-modal selection validation and disable submit until person/section/position are valid
- [x] Make unassign UI update optimistic on first click with rollback on API failure
- [x] Reorder volunteers assignment filter buttons: place "Само неразпределени" as second option (after "Всички")
- [x] Guard autocomplete output emits after component destroy (fix NG0953)
- [x] Stabilize election header date-name initialization/update to avoid NG0100 in dev mode
- [x] Sidebar UX: closed by default and opens fullscreen on mobile, with floating open button and mobile auto-close on nav click
- [x] Volunteers: align "Нов доброволец" modal layout with other creation modals (labeled fields, subtitle, grid actions)
- [x] Volunteers: add dedicated edit-person modal and API integration (`PATCH /elections/manage/:electionId/people/:personId`)
- [x] Creation modal validation: disable submit until required fields are filled (`election-list`, `elections-manage/list`, `admin/users`, `admin/positions`, `election-detail` create person)
- [x] Volunteers: add delete-person action (backend `DELETE /elections/manage/:electionId/people/:personId` + optimistic frontend removal with rollback)
- [x] Docker: include `shared/` package in backend/frontend image builds (root build context + Dockerfile path updates)

---

## Open Questions (Resolved)
- [x] Existing elections: import once, read-only
- [x] Assignment conflicts: hard block
- [x] Date format: `YYYY.MM.DD`
