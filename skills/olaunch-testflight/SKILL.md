---
name: olaunch-testflight
description: "Create TestFlight UAT projects, author and validate testflight_plan.v1 scenarios, assign testers, relaunch runs, and review results. Use for OLaunch TestFlight tasks."
---

# OLaunch TestFlight

Connect `https://mcp.olaunch.io/mcp` and sign in.

## Tools

* Access and clients: `testflight_get_me`, `testflight_list_clients`.
* Projects: `testflight_list_projects`, `testflight_get_project`, `testflight_create_project`, `testflight_update_project`, `testflight_relaunch_project`.
* Scenarios: `testflight_list_project_scenarios`, `testflight_get_scenario`, `testflight_create_project_scenario`, `testflight_update_scenario`, `testflight_replace_scenario`, `testflight_relaunch_scenario`.
* Templates: `testflight_list_templates`, `testflight_get_template`, `testflight_create_template`, `testflight_update_template`.
* Testers and runs: `testflight_list_project_testers`, `testflight_create_project_tester`, `testflight_update_tester`, `testflight_list_project_runs`, `testflight_get_run`, `testflight_get_run_media`.
* Schema checks: `testflight_validate_schema`, `testflight_lint_schema`.

Key arguments:

* `testflight_create_project` needs `name` and either `client_id` or `client_name`, with optional `odoo_url`, `allow_manual_scenarios`, and `record_capture` (`off`, `manual`, `always`).
* `testflight_create_project_scenario` and `testflight_replace_scenario` take `document` or `template_id`. Replace accepts `invalidate_tests` (default `false`) and `feedback`.
* `testflight_create_project_tester` needs `name` and `email`, with optional `visibility` (`assigned`, `all`), `assigned_scenario_ids`, and `allow_manual_scenarios`.
* `testflight_list_project_runs` filters by `scenario_id`, `tester_id`, `result` (`pending`, `pass`, `fail`), `include_historical`, and `include_media`.
* `testflight_lint_schema` takes `document` and optional `vocabulary` (keyed by step ID with `buttons` and `fields` labels).

## Workflows

Set up a project and assign testers:

1. Call `testflight_get_me` and `testflight_list_clients`, then create a project with `testflight_create_project`.
2. Validate and lint each authored `document` with `testflight_validate_schema` and `testflight_lint_schema`.
3. Add scenarios with `testflight_create_project_scenario`, then enrol testers with `testflight_create_project_tester` and `assigned_scenario_ids`.

Update an existing scenario:

1. Validate and lint the updated `document`.
2. Call `testflight_replace_scenario` to archive the old version and keep its `uid`, testers, and run history.
3. Pass `invalidate_tests: true` with `feedback` when the steps changed; keep `false` for wording fixes.

Review failed runs and relaunch:

1. Call `testflight_list_project_runs` with `result: "fail"`, then `testflight_get_run` for the trace and signed media URLs.
2. Call `testflight_get_run_media` if signed URLs expire.
3. Call `testflight_relaunch_scenario` or `testflight_relaunch_project` with `feedback`.

## Authoring `testflight_plan.v1` scenarios

* Required top-level keys: `schema_version` (`1`), `uid` (`snake_case`), `name` (under 70 characters), `description` (one sentence), and `steps`.
* Optional top-level keys: `category`, `subcategory` (Odoo Apps menu names, up to 128 characters, no `/`), `tags` (up to 16 `^[a-z0-9][a-z0-9_]*$` slugs), `allowed_groups`, `required_modules`, `setup`, and `autoplay`.
* Each step needs a unique 1-based `id`, `name`, `type`, and one `type_<type>` payload. Optional keys are `hint`, `optional`, and `autoplay`.
* `wait_window_action`: `{"ext_id_ref": "sale.action_quotations_with_onboarding"}` (`""` matches any).
* `wait_client_action`: `{"tag": "..."}` or `{"ext_id_ref": "..."}`.
* `wait_route`: `{"route": "/my/orders", "match": "exact" | "prefix"}`. A trailing `/` on `prefix` matches subpaths only.
* `wait_record`: `res_model`, `trigger` (`orm_update` or `execute_kw` with `trigger_execute_kw.func_name`), `target` (`new_records`, `existing_records`, or `matched_record` with `target_matched_record.step_id`), `conditions`, `domain` (JSON arrays), and optional `changed_fields` (`orm_update` only).
* `conditions` entries use `field_match_captured_record` (`field`, `step_id`) or `field_match_ext_ref_id` (`field`, `ext_ref_id`).
* `setup` runs ordered 4-item arrays as the tester before start: `create`, `write`, `find` (`xmlid` or `domain`, optional `create` fallback), and `call`. An optional final `["open", "model", ref]` starts on that record.
* Built-in variables for `setup`, `hint`, and `autoplay`: `{{user}}`, `{{run}}` (4-character code), `{{today}}`, `{{today_iso}}` (with `±N` day offsets), and `{{var.field|placeholder}}`.
* Optional `autoplay` defines top-level `vars` (literals or `{model, domain, field?, order?}`), `requires`, and per-step `actions` (`open_menu`, `open_record`, `click`, `click_button`, `open_tab`, `set_field`, `add_line`, `attach`, `save`, `wait`, `note`).

Rules that make a scenario fail:

* Point every `step_id` in `target_matched_record` and `conditions` to an earlier step. Update references if you renumber steps.
* Use only a `many2one` field on `res_model` for `conditions.field`.
* Keep `changed_fields` on `orm_update` steps only; the runtime verifier rejects it on `execute_kw`.
* Keep `{{var}}` out of step `domain` (domains evaluate untemplated). Match `{{run}}`-named setup records with `=like` prefixes.
* Prefer `orm_update` over `execute_kw`: `execute_kw` misses server-side or wizard calls and exposes raw method names in preview.
* Give each `wait_record` step a distinct watch (`matched_record`, `changed_fields`, or `new_records` vs `existing_records`); one event ticks every matching step at once.
* Avoid putting model, field, method, or XML ID names in `name`, `description`, or `hint`. Use the screen labels testers see.
* `testflight_validate_schema` checks JSON shape only; unknown models, fields, or XML IDs fail when opened in Odoo's TestFlight panel.

## Gotchas

* Access levels are User (read only), Author (reads and scenario writes), and Manager (all tools). Shared templates are read only except for OLaunch staff.
* Replacing a scenario that already has `replaced_by_scenario_id` fails; replace its latest successor instead.
* Manual scenarios require `allow_manual_scenarios: true` on both the project and the tester.
* `testflight_create_project_tester` emails an invitation for outside addresses (limit 30 per hour); the tester appears once they accept.
* `testflight_list_project_runs` returns each tester's latest run without media URLs; pass `include_historical: true` for earlier attempts, and call `testflight_get_run` for evidence.
* List tools hide archived items unless `include_archived: true`.

## REST fallback

Apps without MCP can use the REST API: `https://www.olaunch.com/api/docs`.
