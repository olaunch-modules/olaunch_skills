---
name: olaunch-houston
description: "Work a Houston ticket queue in OLaunch: read the tickets client Odoo users report, check what Triage found, change statuses, reply, and act on Triage. Use when asked about Houston tickets or Triage."
---

# OLaunch Houston

Connect `https://mcp.olaunch.io/mcp/houston` (Houston tools only) or `https://mcp.olaunch.io/mcp` and sign in. When you connect, you choose the team and the Houston level.

## Tools

* Access: `houston_get_me`.
* Tickets: `houston_list_tickets`, `houston_get_ticket`, `houston_get_ticket_file`.
* History: `houston_list_ticket_events`, `houston_list_ticket_occurrences`, `houston_list_ticket_deliveries`.
* Triage: `houston_get_ticket_triage`, `houston_list_ticket_triage_runs`.
* Workspace: `houston_list_databases`, `houston_list_destinations`, `houston_get_stats`.
* Ticket actions: `houston_set_ticket_status`, `houston_create_ticket_note`, `houston_redeliver_ticket`, `houston_deliver_ticket`.
* Acting on Triage: `houston_act_on_triage_action`, `houston_rate_ticket_triage`, `houston_rerun_ticket_triage`.

Key arguments:

* `houston_list_tickets` takes `status`: `open` by default, `held`, `dismissed`, `delivery_failed`, `all`, or one status.
* It also filters by `severity`, `type` (`manual` or `error`), `database_id`, `search` and `days`, sorts by `order`, and pages with `limit` (1 to 100, default 20) and `offset`.
* Its `triage` filter is comma-separated: `verdict:issue`, `verdict:not_an_issue`, `verdict:duplicate`, `needs_code`, `action:close`, `action:dismiss`, `action:set_priority`. Keys of one kind widen the list; each kind narrows it.
* `houston_set_ticket_status` takes `status` (`new`, `acknowledged`, `in_progress`, `resolved`, `closed`) or `dismissed: true`.
* `houston_create_ticket_note` takes `body` (up to 5,000 characters) and `public` (default false). A public note is a reply the reporter reads.
* `houston_act_on_triage_action` takes `ticket_id`, `action_id` (from the ticket's Triage `actions`) and `op`: `apply`, `undo` or `dismiss`.
* `houston_rate_ticket_triage` takes `feedback` (`up` or `down`) and, with `down`, a `note` on what was wrong.
* `houston_deliver_ticket` takes a `destination_id` from `houston_list_destinations`.

## Workflows

Work the open queue:

1. Call `houston_get_me` to check the team, your level, the databases you reach, and whether Triage is on.
2. Call `houston_list_tickets`. To find what needs a person first, filter with `triage=verdict:issue` and sort by `severity desc`.
3. Open a ticket with `houston_get_ticket`. Read what the reporter wrote, the error and its traceback, and the latest Triage run.
4. Check `houston_list_ticket_occurrences` for repeats and `houston_list_ticket_events` for what the team already said.
5. Set the status as you go: `acknowledged` once someone owns it, `in_progress`, then `resolved` or `closed`.

Use what Triage found:

1. Read `verdict`, `confidence` (0 to 100), `reasons` and `next_steps` from `houston_get_ticket_triage`.
2. A `duplicate` verdict names the ticket in `duplicate_of`. Compare the two before closing either.
3. `findings` hold the likely cause and a suggested fix as a diff, with the repository, path and line. Show the diff to the user, and apply it to their code only when they ask.
4. Apply or dismiss each suggested action with `houston_act_on_triage_action`. `undo` reverses an applied one.
5. Rate the run with `houston_rate_ticket_triage`. A `down` with a note records what it got wrong.

Reply to the reporter:

1. Draft the reply and show it to the user first.
2. Send it with `houston_create_ticket_note` and `public: true`. Helpdesks that sync notes get it too.
3. For something only the team should see, leave `public` out: that's a private note.

## Gotchas

* Access levels are View (read, private notes, rating Triage) and Manage (adds statuses, public replies, deliveries and Triage actions).
* A ticket on another team or on a database outside the connection's scope answers not found.
* The Triage tools answer `triage_disabled` until the team switches Triage on in the portal.
* `houston_rerun_ticket_triage` runs with the team's own Triage mode. In act mode it may apply actions and send the update to destinations, so ask first. It allows one rerun per ticket in 10 minutes and 50 a day for the team (`rerun_limited`), and refuses while a run is queued or running (`triage_busy`).
* `houston_deliver_ticket` answers `not_deliverable` when the destination doesn't take the ticket, already has it, or the ticket is held. Use `houston_redeliver_ticket` to release a held ticket or retry failed deliveries.
* Files come as metadata. `houston_get_ticket_file` gives a `url` and a `download_url` that work for 5 minutes, so fetch the file straight away.
* A ticket's `held` means Houston keeps it back until it happens again. Held tickets are left out of `status=open`.

## REST fallback

Apps without MCP can use the REST API: `https://www.olaunch.com/api/docs`.
