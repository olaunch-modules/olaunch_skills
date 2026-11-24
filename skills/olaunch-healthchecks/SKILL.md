---
name: olaunch-healthchecks
description: "Connect Odoo databases, run healthcheck reports, and manage custom checks in OLaunch. Use when asked to check client databases, read reports, anonymise fields, or publish checks."
---

# OLaunch Healthchecks

Connect `https://mcp.olaunch.io/mcp` and sign in.

## Tools

* Access and options: `healthchecks_get_me`, `healthchecks_list_options`, `healthchecks_list_regions`.
* Databases: `healthchecks_list_databases`, `healthchecks_get_database`, `healthchecks_create_database`, `healthchecks_update_database`, `healthchecks_delete_database`.
* Reports: `healthchecks_create_database_report`, `healthchecks_list_database_reports`, `healthchecks_get_report`, `healthchecks_get_report_check`.
* Anonymisation: `healthchecks_get_anonymisation`, `healthchecks_update_anonymisation`, `healthchecks_get_database_anonymisation`, `healthchecks_update_database_anonymisation`.
* Custom checks: `healthchecks_list_custom_checks`, `healthchecks_get_custom_check`, `healthchecks_create_custom_check`, `healthchecks_update_custom_check`, `healthchecks_delete_custom_check`.
* Test runs and publishing: `healthchecks_create_custom_check_test_run`, `healthchecks_get_test_run`, `healthchecks_publish_custom_check`, `healthchecks_unpublish_custom_check`.

Key arguments:

* `healthchecks_create_database` needs `odoo_url`, `database`, `username`, `api_key`, `consent: true`, and either `client_id` or `client_name`.
* `healthchecks_update_database` needs `api_key` again whenever `odoo_url`, `database`, or `username` changes.
* `healthchecks_get_report` filters by `section`, `status`, `severity`, `check`, or `company_id`.
* `healthchecks_get_report_check` pages rows with `limit` (1 to 1000, default 100) and `offset`.
* `healthchecks_update_anonymisation` and `healthchecks_update_database_anonymisation` replace the list with `rules` (`{"model", "field"}`, either null for any).
* `healthchecks_create_custom_check` needs `title` and `model`, with optional `domain`, `columns`, `category`, `severity`, `tags`, and `versions`.

## Workflows

Connect a database and read its report:

1. Call `healthchecks_get_me` to confirm your role and client scope.
2. Call `healthchecks_create_database` once the client agrees (`consent: true`). OLaunch verifies the login and queues the first report.
3. Poll `healthchecks_get_report` until `state` is `done`.
4. Read failing rows with `healthchecks_get_report_check`.

Build and publish a custom check:

1. Call `healthchecks_list_options` to get valid categories, severities, and versions.
2. Call `healthchecks_create_custom_check` to save a draft.
3. Run `healthchecks_create_custom_check_test_run` on one database and poll `healthchecks_get_test_run` until `state` is `done` or `error`.
4. Fix any lint errors with `healthchecks_update_custom_check`, then call `healthchecks_publish_custom_check`.

## Gotchas

* Access levels are View (read only), Connect (reads, connecting databases, queueing reports), and Full (all tools).
* Publishing, unpublishing, editing a published check, or changing partner anonymisation requires access to all clients.
* Connections limited to specific clients must pass `client_id` on `healthchecks_create_database` instead of `client_name`.
* A check `domain` is a Python literal string supporting relative UTC tokens such as `{today-90d}` or `{now-24h}`. Matching records fail the check.
* Report rows return only when `details_allowed` is true for the database level. Anonymised values return as stable `anon_...` tokens per partner.
* Unpublish a custom check before deleting it. Test runs allow one active run per check and three per support partner.
* `healthchecks_list_database_reports` pages with `limit` (1 to 100, default 20) and `offset`.

## REST fallback

Apps without MCP can use the REST API: `https://www.olaunch.com/api/docs`.
