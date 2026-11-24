---
name: olaunch-conversions
description: "Follow OLaunch conversion projects, tasks, and verification reports, manage deploy keys, and update client modules. Use when asked about conversion status or Git updates."
---

# OLaunch Conversions

Connect `https://mcp.olaunch.io/mcp` and sign in.

## Tools

* Access: `conversions_get_me`.
* Projects and runs: `conversions_list_projects`, `conversions_get_project`, `conversions_list_project_jobs`, `conversions_get_job`.
* Reports: `conversions_list_job_reports`, `conversions_get_job_report`, `conversions_get_report`.
* Deploy keys: `conversions_get_project_deploy_key`, `conversions_create_project_deploy_key`.
* Module updates: `conversions_update_client_module`, `conversions_update_job_client_module`, `conversions_list_operations`, `conversions_get_operation`.

Key arguments:

* `conversions_list_projects` filters by `client_id`, `active`, `has_client_addons`, or `q`, and pages with `limit` (1 to 100, default 20) and `offset`.
* `conversions_get_job_report` takes `job_id` and `report_id`. `conversions_get_report` takes `project_id` and `report_id` for the latest run.
* `conversions_update_client_module` filters live runs by `project_id`, `client_id`, `repo`, or `branch`, and pages with `after`.
* `conversions_update_client_module` and `conversions_update_job_client_module` accept `force: true` to discard local checkout edits.

## Workflows

Check conversion progress and verification reports:

1. Call `conversions_get_me` to check your role and scope, then `conversions_list_projects`.
2. Call `conversions_get_project` for the latest run summary, or `conversions_list_project_jobs` and `conversions_get_job` for tasks.
3. Call `conversions_list_job_reports`, then `conversions_get_job_report` (text caps at 6,000 characters; `report_url` holds the full file).

Set up a deploy key for private addon repositories:

1. Call `conversions_get_project_deploy_key`. If it returns `no_deploy_key`, call `conversions_create_project_deploy_key`.
2. Give the user `public_key` to add read-only to their addon repositories, plus `ssh_from` for self-hosted Git firewalls.
3. For several GitHub repositories, tell the user to add the key to a read-only machine user account.

Update client modules on a live run:

1. Call `conversions_update_client_module` with `project_id` (or `repo` and `branch`), or `conversions_update_job_client_module` for one `job_id`.
2. Poll `conversions_get_operation` with the returned operation `id` until `state` is `done`, `partial`, or `failed`.
3. Inspect each `jobs` entry for `state`, per-repo status, `failed_module`, `traceback`, and `log_tail`.

## Gotchas

* Access levels are View (read only) and Manage (adds deploy key creation and client module updates). Out-of-scope projects return not found.
* Pass `project_id` (or `repo` and `branch`) to `conversions_update_client_module` unless asked to update every run. Each update restarts Odoo.
* One bulk update covers at most 50 databases. If `truncated` is true, call again with `after` from `next_url`.
* Over MCP, `wait` returns immediately. Poll `conversions_get_operation` until finished (queue wait plus run can take up to 85 minutes).
* Failed upgrades roll back code and databases. If a repo reports `repo_dirty`, ask the user before retrying with `force: true`.
* Common refusals: `job_busy`, `job_not_live`, `job_shared_env`, `external_odoo_job`, `no_client_addons`, `repo_has_credentials`, and `rate_limited` (1 per 10 seconds, bursts of 6).
* Wait until an update operation finishes before resuming conversion tasks. A new deploy key applies from the next conversion run.
* `conversions_list_project_jobs` and `conversions_list_operations` page with `limit` (1 to 100, default 20) and `offset`.

## REST fallback

Apps without MCP, GitLab webhooks, and GitHub Actions can use the REST API: `https://www.olaunch.com/api/docs`.
