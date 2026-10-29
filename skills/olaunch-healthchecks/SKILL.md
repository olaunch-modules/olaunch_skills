---
name: olaunch-healthchecks
description: Connect client databases, generate and query healthcheck reports, set anonymised fields, and create, edit, test run and publish a support partner's custom OLaunch healthchecks through the OLaunch Healthchecks REST API. Use when asked to connect a client to healthchecks, run or read a healthcheck report, anonymise report fields, or add, change, test or publish a custom healthcheck.
---

# OLaunch Healthchecks API

Everything the API can do is described in its OpenAPI document. Read it first
and follow it:

    https://www.olaunch.com/api/v1/healthchecks/openapi.json

## API key

- The user creates a personal API key in the OLaunch portal under
  Settings > API Access. It is shown once; ask the user for it and never print,
  log or commit it.
- Send it on every request: `Authorization: Bearer <key>` (or `X-API-Key: <key>`).
  The OpenAPI document needs it too.
- A key acts as its user on one support partner, with their healthcheck role:
  View Access can only read, Full Access can also connect databases, generate
  reports, set anonymised fields and create, edit, test run and publish
  checks. With access to specific clients only, the key reaches only those
  clients' databases, and publishing or changing the partner-wide anonymised
  fields needs access to all clients.
- A key can also be Limited: a Healthchecks level (View, Connect, Full) and
  some of the user's clients. It gets the lower of that and the user's own
  access; Connect can connect databases and generate reports but not change
  them. A 403 `key_access_required` means the key, not the user, is too
  narrow: ask the user to edit the key rather than retrying.
- Call `GET https://www.olaunch.com/api/v1/healthchecks/me` first to check the key and see
  what it can reach.

## How it works

Client databases: connect one with `POST /databases` (its Odoo address,
database name, a user's login and API key, the client it belongs to, and
`consent: true` once the client has agreed). Its first report is queued
straight away.

Reports: `POST /databases/<id>/reports` queues a report; poll
`GET /reports/<id>` until `state` is `done`, then it lists every company's
checks with their status. Read a check's rows with
`GET /reports/<id>/checks/<check_id>`, paging with `limit` and `offset`.

Anonymisation: `PUT /anonymisation` lists fields whose values come back as
stable tokens (`anon_…`) in every row the API returns;
`PUT /databases/<id>/anonymisation` adds more for one database. Tokens are the
same for the same value, so rows can still be grouped and matched.

Custom checks: create a check as a draft, test run it on one client database
and poll the run until it is done, fix what it reports, then publish it so it
runs in every client's healthcheck report.
