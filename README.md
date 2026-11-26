# OLaunch skills

Agent skills for the OLaunch MCP server (`https://mcp.olaunch.io/mcp`). They teach MCP clients how to work with OLaunch for you.

| Skill | What it does |
|---|---|
| [`olaunch-healthchecks`](skills/olaunch-healthchecks/SKILL.md) | Connect client databases, run healthcheck reports, anonymise fields, and publish custom checks. |
| [`olaunch-testflight`](skills/olaunch-testflight/SKILL.md) | Manage TestFlight projects, author scenarios, assign testers, and review runs. |
| [`olaunch-conversions`](skills/olaunch-conversions/SKILL.md) | Follow conversion projects and verification reports, manage deploy keys, and update client modules. |
| [`olaunch-houston`](skills/olaunch-houston/SKILL.md) | Work a Houston ticket queue: read tickets, check what Triage found, reply, and act on Triage. |
| [`olaunch-mcp-gateway`](skills/olaunch-mcp-gateway/SKILL.md) | Inspect and update records inside approved client Odoo databases. |

## Install

```bash
npx skills add olaunch-modules/olaunch_skills --global
```

This installs every skill for every agent on your machine. Update later with:

```bash
npx skills update
```

To install one skill only, pass `--skill` with `olaunch-healthchecks`, `olaunch-testflight`, `olaunch-conversions`, `olaunch-houston`, or `olaunch-mcp-gateway`.

## Connect

Connect `https://mcp.olaunch.io/mcp` in your MCP client and sign in with OAuth or an OLaunch API key. Apps without MCP can use the REST API at `https://www.olaunch.com/api/docs`.
