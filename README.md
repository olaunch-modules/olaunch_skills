# OLaunch skills

Agent skills for the OLaunch REST APIs. They teach an AI agent (Claude Code,
Codex, Cursor and any other agent that reads skills) how to work with OLaunch
for you.

| Skill | What it does |
|---|---|
| [`olaunch-testflight`](skills/olaunch-testflight/SKILL.md) | Create TestFlight projects, write and load scenarios, assign testers, relaunch with feedback and read the results. |
| [`olaunch-healthchecks`](skills/olaunch-healthchecks/SKILL.md) | Connect client databases, run and read healthcheck reports, anonymise fields, and build, test and publish custom healthchecks. |
| [`olaunch-conversions`](skills/olaunch-conversions/SKILL.md) | Follow conversion projects, their runs, tasks and verification reports, get the deploy key, and update a running conversion's client modules from Git (by hand, from CI or on every push). |

## Install

```bash
npx skills add olaunch-modules/olaunch_skills --global
```

This installs every skill for every agent on your machine. To pick up new
versions:

```bash
npx skills update
```

To install one skill only, add `--skill olaunch-testflight`,
`--skill olaunch-healthchecks` or `--skill olaunch-conversions`.

## API key

Every skill calls the OLaunch API with your personal API key. Create one in the
OLaunch portal under **Settings → API Access** and give it to your agent when
it asks.
