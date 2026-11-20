---
name: olaunch-conversions
description: "Follow a support partner's OLaunch conversion projects through the OLaunch Conversions REST API: their runs and each run's tasks, the verification reports and the deploy key. Update a running conversion's client modules from its Git repositories, from a terminal or a CI job. Use when asked to check a conversion's progress or reports, or to get or create a project's deploy key. Use it to pull a client's new custom addon commits into a conversion and upgrade them. Use it to set up a GitLab webhook or GitHub Actions workflow that runs that update on every push."
---

# OLaunch Conversions API

Everything the API can do is described in its OpenAPI document. Read it first
and follow it:

    https://api.olaunch.io/api/v1/conversions/openapi.json

Every call goes to `https://api.olaunch.io`. The step-by-step guide for
GitLab and GitHub is in the OLaunch portal's API docs. Sign in at
www.olaunch.com, open the API docs, choose Conversions and go to "Update
client modules from your Git host".

## API key

- The user creates a personal API key in the OLaunch portal under
  Settings > API Access. It is shown once; ask the user for it and never print,
  log or commit it.
- Send it on every request: `Authorization: Bearer <key>` (or `X-API-Key: <key>`,
  which is what a GitLab webhook's custom header uses). The OpenAPI document
  itself is public.
- A key acts as its user on one support partner (team), with their Conversions
  role. View reads projects, runs, tasks, reports and the deploy key; Manage
  can also update client modules and create the deploy key. With access to specific
  clients or databases only, the key reaches only those projects; anything
  outside them answers 404, never 403.
- A key can also be Limited: a Conversions level (View or Manage) and some of
  the user's clients and databases. It gets the lower of that and the user's
  own role. A 403 `key_access_required` means the key itself is too narrow:
  ask the user to widen the key, as a retry gets the same answer.
- Call `GET https://api.olaunch.io/api/v1/conversions/me` first to check the
  key and see what it can reach.

## How it works

Projects: `GET /projects` lists the team's conversion projects (one per client
database), each with its git Custom Addons lines (`client_addons.git`, as
`{url, branch}`) and its latest published run (`latest_job`). The project id is
stable; a run's (job's) id changes with every new run. `GET /projects/<id>/jobs`
lists its runs; `GET /jobs/<id>` shows one with its tasks and their states.

Reports: `GET /jobs/<id>/reports` lists a run's verification reports with
`pass|warn|fail|pending`; `GET /jobs/<id>/reports/<report_id>` gives one as
text (cut to 6000 characters; the full one is at `report_url`).

Deploy key: `GET /projects/<id>/deploy-key` gives the public key the runners
clone private repositories with, and `ssh_from`, the addresses they connect
from. Until the key exists it answers 404 `no_deploy_key`; a Manage key creates
it with `POST` on the same URL. It is one key per support partner and region,
shared by every client's runs there. Tell the user to add it read-only, and
only to the addon repositories their conversions use. GitHub accepts a deploy key on one
repository only: with several addon repositories there, add it to a read-only
machine user (a GitHub account for automation) instead. A key added, or a repository line changed,
after a run started reaches that run only with a new run.

## Updating client modules

An update pulls the latest commit of each git Custom Addons line into the
run's environment, upgrades the installed modules that changed (`-u`) and
restarts its Odoo. A failed upgrade is rolled back (databases and code) and
the result carries the `traceback`, `failed_module` and `log_tail`. When there
is nothing new to pull, the update answers `done` with every repo `unchanged`
and Odoo keeps running.

- `POST /client-modules/update?project_id=<id>` updates a project's live run:
  use this in scripts, CI and webhooks. Always pass `project_id` (or `repo` and
  `branch`) unless the user explicitly asks to update all their runs: each
  update restarts that run's Odoo. `?repo=<url>&branch=<branch>` updates
  every live run that uses that repository; `client_id` narrows further. With
  no filter it updates every run the key reaches, at most 50 databases per
  call: follow `next_url` (POST it on `https://api.olaunch.io`) while
  `truncated` is true.
- `POST /jobs/<job_id>/client-modules/update` updates one run. It refuses with:
  - 409 `job_busy`: a conversion run is queued, running or waiting to start;
  - 409 `job_not_live`: the project's live run is a newer one;
  - 409 `job_shared_env`: its slot group reaches outside the key;
  - 422 `external_odoo_job`: the run converts into the client's own Odoo, so
    update it there;
  - 422 `no_client_addons`: the run needs a git Custom Addons line first;
  - 422 `too_many_repos` or 422 `too_many_jobs`.

  The project and repository calls skip such a run instead (`skipped` with
  that code). A `repo` filter with credentials answers 422
  `repo_has_credentials`; one with a query string answers 422 `bad_repo_url`.
- **Every parameter goes in the query string** (`wait`, `force`, the filters).
  The request body is ignored.
- Each call answers 202 with an operation: poll its `poll_url`
  (`GET /operations/<uuid>`) until `state` is `done`, `partial` or `failed`.
  Add `wait=<seconds>` (0 to 90) to either call to long-poll instead: an
  update that finishes inside the wait answers 200, so accept both. Keep
  `wait` out of webhook URLs.
- Read each line of `jobs`: its `state` (`skipped`, `queued`, `running`,
  `unknown`, `done`, `partial`, `failed`), `code`, and per repo `state`
  (`updated`, `unchanged`, `repo_not_cloned`, `repo_dirty`,
  `repo_access_denied`, ...). `repo_dirty` means local edits in the run's
  checkout: only rerun with `force=1` if the user agrees to discard them. An
  `unknown` line may have run; it holds new runs of that environment until
  `hold_until`. A key limited to specific databases sees a line's results
  (`traceback`, repo states) only when it reaches every database the update
  covers. Otherwise those fields are null on purpose, as the key can't see
  them.
- An update queues behind one already running for the same run, and joins an
  identical one still queued. It can wait up to 55 minutes for its runner and
  run up to 30, so a CI job should allow about 90 minutes.
- Limits: one update call per 10 seconds per key, bursts of 6 (429
  `rate_limited`). A 503 `busy` changed nothing: retry after `Retry-After`.
- Don't resume or start a run's tasks while its update is running: the update
  stops the client's Odoo. Resume once the operation is `done`.

When the user wants updates on every push, point them at the portal API docs'
Git hosts section. It covers a GitLab webhook (16.11+, custom header
`X-API-Key`) on the `?project_id=` URL, and a GitHub Actions workflow, since
GitHub webhooks can't send the header. Either way the key goes in a masked CI
secret.
