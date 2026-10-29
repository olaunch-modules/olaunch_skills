---
name: olaunch-testflight
description: Build OLaunch TestFlight scenarios for user-testing. Use testflight rest-api to create UAT projects, load scenarios (from templates or authored plan documents), assign testers, relaunch scenarios with feedback and read run results. Write an OLaunch TestFlight scenario (a JSON file describing a business journey that Odoo watches the user perform, ticking each step off as they do the real work), categorised so it groups with its app area in the tester's list. Use when creating or editing a file in an olaunch_testflight_scenarios/ directory.
---


# OLaunch TestFlight

Two halves: (1) driving TestFlight through the OLaunch REST API — projects, scenarios, templates, testers, relaunches, run results — and (2) authoring the testflight_plan.v1 documents that scenarios run. Load a scenario by POSTing an authored document (or a template id) to a project; testers then run it in their Odoo.

## Before you start: the API key

Every REST call needs a personal OLaunch API key. You will not have one unless the user gives it to you — never invent, guess or reuse a key from elsewhere. If the user has not provided one, ask, and give them these three steps:

1. Log in to the OLaunch portal and open **Settings → API Keys** (`https://www.olaunch.com/portal#settings`).
2. Click **Create key**, give it a description (e.g. the name of this agent or task), and pick the support partner if asked.
3. **Copy the key when it is shown** — it is displayed exactly once, then only a hash is kept — and hand it to you.

Store the key securely before making any request: put it in an environment variable or the project's secret store, never in source files, commit history, logs, or your replies. Read it from there each time and send it only in the `Authorization: Bearer <key>` header to the base URL below. If a key is ever exposed, tell the user to revoke it on the same Settings page and create a new one.

## OLaunch REST API

You can view the olaunch openapi scheme at `https://testflight.olaunch.com/api/v1/testflight/openapi.json`. Make sure you check this at the start of a task, you dont need to check it before every query.

### Changing a scenario that testers already have: replace, don't rewrite

A scenario is versioned by **replacing** it — `POST /api/v1/testflight/scenarios/<scenario_id>/replace` with `{"document": {...}}` (or `{"template_id": N}`). The old version is archived and linked to the new one (`replaced_by_scenario_id` on the old, `replaces_scenario_id` on the new, `version` incremented); the new one keeps the uid, sequence, assigned testers, region and run settings, and every recorded run moves onto it stamped with `origin_scenario_id`, so project progress carries straight on.

Decide what happens to the results testers already have:

- `"invalidate_tests": false` (default) — their latest pass/fail still counts on the new version. Use for wording fixes and small corrections.
- `"invalidate_tests": true` — every assigned tester is relaunched (optional `"feedback"` is shown to them) and the new version starts pending for all of them. Use when the journey itself changed.

Never archive-and-create by hand, and only `PATCH {"document": ...}` for an in-place fix that does not change what testers do: neither keeps the version chain, and both can leave a tester's result attached to steps they never ran. A scenario that already has `replaced_by_scenario_id` answers 422 — replace that successor instead.

### Open in Odoo: pointing a project at the database it tests

A project can carry `odoo_url`, the http(s) address of the Odoo database its
scenarios are run against. It is optional and changes nothing about how a
scenario runs — with it set, the project page in the portal grows an **Open in
Odoo** button, so a manager reading results can jump straight into the
database they came from. Set it on `POST /projects` or
`PATCH /projects/<project_id>`, and send `null` to take it (and the button)
away. Demo projects fill it in themselves with their demo host address.

```json
PATCH /api/v1/testflight/projects/42
{"odoo_url": "https://acme.odoo.com"}
```

### Manual test flights: scenarios the tester writes by naming them

Not every scenario is planned. A tester can start a **manual test flight** from
the TestFlight panel: they name what they are about to check, do the work, and
finish — the scenario is created in the project as they start, assigned to
them, and their run is filed against it. It carries one placeholder step,
because the recording, the screenshots and their notes are the actual result.

Scenarios made this way come back with `"is_manual": true`, so a project's
scenario list still reads as what was planned with the ad-hoc ones
recognisable among them. Do not author `is_manual` yourself — it is set by the
panel, and a replacement of a manual scenario stays manual.

Off by default, and it takes two switches to turn on:

- `allow_manual_scenarios` on the **project** — this project accepts ad-hoc
  scenarios at all;
- `allow_manual_scenarios` on the **tester** (their enrolment) — this person is
  one of the people who may write them.

Both must be true. A project that says no cannot be talked round by an
enrolment, and a project that says yes does not hand the right to everyone in
it. The panel only offers the button where both are on, so a tester who cannot
use it never sees it. Set either with `PATCH /projects/<project_id>` or
`PATCH /testers/<tester_id>` (see the OpenAPI schema).

### Record capture: what the tester actually did

An ad-hoc flight has one placeholder step, so the steps say nothing about what
happened in it. **Record capture** fills that gap: while the run is live, the
tester's own database notes every business record they create or change, rolls
each one up (one entry per record, however many times it was written) and
sends the list back with the run. Field *names* travel — `partner_id`,
`date_order` — never the values in them, and machinery (`ir.*`, `bus.*`,
`mail.*`, the trace itself) is never captured at all.

Set it per project with `record_capture` on `PATCH /projects/<project_id>`:

- `off` — runs carry only steps, screenshots and the recording;
- `manual` (**default**) — on for ad-hoc flights, where there is nothing else
  to show;
- `always` — every run reports the records the tester touched.

Each scenario the panel fetches carries the resolved answer as
`capture_records`, so the client obeys one boolean rather than re-deciding the
policy. The tester sees it while they work — the panel says it is noting their
records, with a running tally — so nobody is recorded without knowing.

On a submitted run the list arrives as `records`, each entry naming the model,
the id, the display name as it read at the time, whether the tester created it,
which fields were touched, and when — so the portal can jump the recording to
the moment the record appeared. Records nest under the captured record they
belong to (an order's lines under the order). A run that touches more than the
cap (500 by default, `olaunch_testflight.capture_limit` on the client) stops
there and says so with `records_truncated`.

### Email notifications

Every project returns a `notifications` object (`GET /api/v1/testflight/projects/<project_id>`) and accepts one in `PATCH`. Six switches, each `default | on | off`, where `default` follows the support partner's setting — `effective` shows what each resolves to:

- Support partner team: `sp_project_complete` (every tester has passed every scenario assigned to them), `sp_test_failed` (a failed run came in), `sp_project_inactive` (a project with pending tests has been quiet for `sp_inactive_days`).
- Testers: `tester_assigned`, `tester_relaunched` (with or without feedback), `tester_reminder` (outstanding tests after `tester_reminder_days` of inactivity).

`recipients` is `default | all | specific`; with `specific`, `notify_user_ids` picks from `notifications.team` (team members with a TestFlight role and access to the project). Days accept an integer or `null` for the partner default. Send only the keys you change:

```json
PATCH /api/v1/testflight/projects/42
{"notifications": {"sp_test_failed": "off", "tester_reminder_days": 3, "recipients": "specific", "notify_user_ids": [7]}}
```

The support partner's own defaults are set in the TestFlight Portal, not over the API. To silence one tester entirely for a project, `PATCH /api/v1/testflight/testers/<tester_id>` with `{"notifications_disabled": true}`. Inactivity notices send once per quiet spell and re-arm when activity resumes; demo projects never email anyone.

# Authoring TestFlight scenarios

## The TestFlight module: needed to build and test scenarios

A scenario only runs inside Odoo, through the **TestFlight client** module (`olaunch_testflight`) installed in the database. It is the TestFlight panel, the engine that ticks steps, auto play and Guide me, and the verifier that checks a scenario against the database's real models, fields and menus. Without it you can write a scenario file and pass schema validation, but you cannot open it, play it or prove it ticks.

Check first whether the database has it (Apps, search "OLaunch TestFlight", or the TestFlight button in the top bar). If not:

1. Download the TestFlight client for the database's Odoo version from https://www.olaunch.com/api/docs?debug=1. It needs an olaunch.com login on a support partner team or enrolled as a tester. The download is `olaunch_testflight.zip`.
2. Unzip it into the database's addons path. Its Python needs `jsonschema` and `jwcrypto`.
3. Restart Odoo, update the apps list, and install **OLaunch TestFlight**.

Use a test or staging database, never production: flying a scenario creates real records.

# Before working with TestFlight Scenarios
Ask questions as needed
- Odoo url and access details
- **Ask before building whether the scenarios should be tested, and recommend it.** Testing means flying each one end to end by auto play in a browser (see **Testing a scenario end to end with auto play**). Agree it up front, because it decides what you need before writing anything: a database with the TestFlight module installed, a login, the browser automation you can use, and access to the server log if there is one. A scenario written without a database to test it on is a guess at the screen.
- If in a dev environment you will want to watch Odoo logs
- Find and read every `TESTFLIGHT_NOTES.md` in the source: `find -L <addons path> -name TESTFLIGHT_NOTES.md -not -path '*/node_modules/*'` (in an olaunch dev branch the addons path is `addons/`). Customer repos keep one at their root (for example `addons/cust-powa/TESTFLIGHT_NOTES.md`), and a module may keep its own. Each records how that customer works and what their testers expect, and its rules win over this skill's where the two disagree. A note next to the scenario's module wins over one higher up. When a tester's feedback shows a customer-specific trap, add it to the nearest one, or create one at the customer repo's root.
- Edit only the testflight scenario json file you are working on . Treat all code as read-only unless explicitly approved and instructed.

# TestFlight Scenario Types
- Local Tests (Stored in json files located inside any installed module <module_name>/olaunch_testflight_scenarios/*.json
- OLaunch TestFlight Portal (Stored online and can be uploaded using the TestFlight Portal skill)

# Authoring a Local TestFlight scenario
- Each scenario is a single json file in **`<module_name>/olaunch_testflight_scenarios/`** directory. 
- **Any installed Odoo module may ship none, one or more scenarios**
- Put authored scenarios in the module that best defines the feature. 
- Do not put authored modules in external repos (Odoo base, Odoo Enterprise, OCA, olaunch_testflight, etc) instead create a new module unless otherwise directed by the user (eg. `client_testflight/olaunch_testflight_scenarios/`)
```
your_module/
    __manifest__.py
    olaunch_testflight_scenarios/
        my_scenario.json
```

The filename stem IS the `uid` you write in the file. The server addresses the scenario by its **module-qualified** uid — `your_module.my_scenario` — exactly as an Odoo data file writes `id="foo"` and the system knows it as `module.foo`. So you only need your name to be unique *within your module*, and two modules can both ship `smoke_test.json` without clashing.

New test scenarios are discovered automatically (a NEW directory needs the module installed, or the server restarted to be detected for the first time).

`allowed_groups` [optional]
— **omit it and everyone sees the scenario**. Any one match is enough. A comma seperated list of Odoo external ids.
- The label shown to the tester is read from the database at runtime

`required_modules` [optional]
— **omit it and the scenario is shown on every database**. A list of Odoo module technical names (`"sale_management"`, not "Sales"); the scenario is listed only where **all** of them are installed, and is hidden everywhere else rather than shown as broken. This applies to scenarios shipped in a module and to those assigned from olaunch.com alike.
- Use it when a scenario walks through an app its own module does not depend on, e.g. a `client_testflight` scenario that needs `mrp` or `website_sale`.
- The module that ships the scenario is installed by definition, so do not list it.
- In TestFlight Studio this is the **Needs modules** box.
- Older builds of olaunch_testflight do not know the key and reject the whole file as invalid. It needs 16.0.1.3.10, 17.0.1.3.10, 18.0.1.3.10, 19.0.1.2.11, 20.0.1.2.11 or later, so check the installed version before relying on it.

## Naming a scenario and its steps

**What the tester actually reads on a step.** The panel shows up to three lines on each step card, and you write two of them:

| line | where it comes from | shown |
|---|---|---|
| the step `name` | you | always |
| the matched record's name | the record that ticked the step | once it ticks |
| the step `hint` | you | while the step is the current one |

Preview the steps (the eye beside the scenario) also shows a line generated from each step's watch ("A Journal Item is created"), built from the model you watch and the trigger you pick — see **Watch the outcome, not the method** below.

A tester reads the `name`, the `description` and the step list and nothing else. Write all three for someone who knows the business and not the database.

**Scenario `name`** — the journey, as a person would describe it, under about 70 characters. Leave the app out: the scenario's `category` already groups it under that app in the panel's list.
- Good: "Unbuild a serial-tracked manufactured unit"
- Good: "Override a customer's credit limit"
- Bad: "Accounting: Invoice a customer" — repeats the ACCOUNTING header it sits under.
- Bad: "Test stock_control" — names the module, not the journey.

**Scenario `description`** — one sentence on the business use-case covered, not a list of every step or an internal detail.
- Good: "Quote to cash process for a stocked product"
- Bad: "Confirm a quote to become a sale order for storable products, then open the delivery and validate delivery so that its state decreases by the ordered quantity."

A scenario should cover a high-level activity a user really does in normal operation — a CRM, Sale, Inventory or MRP business process — not a single field or an edge case.

**One journey per scenario: every step leads to the ending.** Before writing steps, say in one sentence what the tester achieves by the last step. Then each step must either be part of reaching it or set up something a later step needs. A step that edits the same record for an unrelated reason belongs in its own scenario, even when it is "while you are there" on the same screen. Long setup chains are fine when the ending depends on them; side tasks are not.
- Good: "Add a sub-category and put a product in it" ends on the sub-category tile on the website; every step builds the sub-category or fills it.
- Bad: the same scenario also writing the product's website description and add-to-cart message. The tile does not need them, so they are a second journey ("Update a product's web page") and get their own file.
- Test: delete the step. If every later step and the ending still work, and the step checks something the scenario's name does not promise, split it out.
- **Converting a tour, a training script or a test checks every beat against the ending.** Odoo's onboarding tours show off features along the way — schedule an activity, log a note, set a tag — because their job is a tour of the app. A scenario's job is one journey. Apply the delete test to each beat before writing it as a step; a beat that fails it is left out (or becomes its own scenario), however prominent it is in the source.
  - Example: `crm_tour` schedules an activity on its way to marking the opportunity won. Winning does not depend on it, so "Win an opportunity" has no activity step.

**`uid`** — snake_case, the journey in a few words (`month_end_freight_reconciliation`), matching the filename stem and unique within the module.

**Step `name`** — short, imperative, and about what the tester must *do*. Never tell a tester what *not* to do, and do not restate the final state.
- Good: "Validate the delivery"
- Bad: "Delivery state is 'done'" — that is the step's `domain`, not its name.
- Bad: "Confirm Quote - Do not cancel" — a scenario never says what not to do.

**Keep record names out of the step name — they go in `hint`.** A setup record's name is machine-made ("TF Product BWQ7"), and dropped into a name it buries the action the step is about. The step list should read as the journey at a glance; refer to the record by its role ("the product", "the new sub-category", "the customer") and let the hint carry `{{var}}` for the exact name the tester has to find.
- Good: "Put the product in the new sub-category" · Hint: "Open {{product|the product}} and add the sub-category under Categories."
- Bad: "Put {{product|the product}} in the new sub-category" — mid-run it reads "Put TF Product BWQ7 in the new sub-category".
- Bad: "Add a sub-category under {{parent|the parent category}}".

**Except when the system is the actor.** Some of the most valuable steps are ones the tester does nothing for: an automation stamps a field, validating a delivery raises the balance invoice, a deposit releases shipping. Those steps are named for the outcome, because that is the whole point of watching them, and their only autoplay action is a `note`.
- Good: "The deposit unlocks shipping"
- Good: "Components return to stock"

**Never put technical vocabulary in front of a tester.** A scenario is read by the person
who does the job, not by the person who wrote the module. Method names, model names, field
names and external ids belong nowhere the tester can see them — not in `name`, not in
`description`, not in `hint`. Say what happens to the business object.
- Good: "Apply the counted quantity"
- Bad: "Run action_apply_inventory on the quant" — names a method and a model.
- Bad: Hint "sets `inventory_quantity_set`" — names a field; say "the count is written onto
  the stock figure".

**Call things what Odoo's screens call them, and nothing the screens don't show.** Use
the names the interface itself shows — labels, tooltips, menu and app names — the same
way in every scenario, so a tester learns Odoo's own words: the screen of app icons is the
**Home menu** (its button's tooltip), the
buttons above the messages are Send message, Log note and Activity. Never invent a
description where Odoo has a name ("the screen of apps", "the list of apps", "the home
screen with the icons" all mean the Home menu). Developer terms the screen never shows —
"chatter", "kanban", "statusbar", "breadcrumb", "quick create", "smart button",
"many2one", "wizard", "control panel" — mean nothing to a newcomer: say where the thing
is and what it is labelled instead.
- Good: "Navigate to Documents."
- Bad: "Click Documents on the screen of apps." Odoo calls it the Home menu.
- Good: "Press Activity."
- Bad: "Press Activity above the chatter."
- Good: "Click the Qualified stage."
- Bad: "Click the next stage in the statusbar."
- Good: "… and save." Say "save", not "press the cloud icon": every tester knows how to
  save a form, and naming the icon only adds words.
- Bad: "… and press the cloud icon (Save manually) next to the task name."

**Don't say where a labelled button is.** A tester finds a button by its label, so
"Press Log note" is enough; "Log note, beside Send message", "Confirm at the top of the
invoice" and "Won in the row of buttons at the top" only add words to read. Give a
location only for something with no label or an ambiguous one: an icon (the menu with three
lines), or a label that appears twice on the screen.
- Good: "Press Log note, write a short note and press Log."
- Bad: "Press Log note, beside Send message, write a short note and press Log."

**The parts of a screen have Odoo names too.** An input is a **field**, named by its
label ("the Customer field", never "the Customer box"). A tile on a board or overview is
a **card** ("the Customer Care card"). The search input is the **search bar**.

**Picking a value from a list is one verb: select.** Odoo's many-to-one inputs search as
you type, and a tester who has used any web form knows that. Say which value goes in
which field and stop; do not narrate typing, the list opening and the click.
- Good: "Press New, type a title, select {{customer|the customer}} as the Customer, then
  press Add."
- Bad: "In the small form that opens at the top of the first column, type a title, type
  TF Customer 286X in the Customer box and pick it from the list, then press Add."

**Watch the outcome, not the method.** This is not only a naming rule: Preview the steps
writes its own line for each step from the step's definition, and a `wait_record` step
triggered on `execute_kw` renders it as `"action_apply_inventory" is run on a Quants` — the
raw method name, in front of whoever previews the scenario, however well you named the step. Model the
step as the record change the method causes (`orm_update`, with `changed_fields` and a
`domain`) and the panel describes it in business terms instead. Reach for `execute_kw` only
when a method genuinely leaves no trace on a record the tester is following.

**Keep menus and buttons out of the name — they go in `hint`.** The name survives a re-skin and a version upgrade; the button label does not.
- Name: "Add the delivery method" · Hint: "Use Add Shipping in the order header; the order will not confirm without a delivery line."

### Wording: what the tester reads

Three rules cover most bad wording. They apply to the scenario `name` and `description` and to every step `name` and `hint`.

**Use the words on the screen.** Name a button, tab or field by its label in the view, never by the method or field behind it. Read the labels from the form view (`string` on the `<button>` or `<field>`, or the field's own label) in the database the scenario runs on, because customisations rename them.
- Good: "Press Confirm."
- Bad: "Trigger action_confirm on the sale."
- Bad: "Set partner_id." Say "Set the Customer."

**Say the action, then stop.** A hint says what to do. It does not explain what the system does afterwards, why the ticket needed it, or what the step proves.
- Good: "Press Add Schedule again, tick This Quarter Only, set Provider to Unknown and enter the manual estimate it asks for, then Save."
- Bad: the same hint followed by "The recurrence is capped at quarter end and the schedule has no recurring service created for it yet."
- A check step may say what to look for, in one short sentence: "On Hand now shows the 4 you counted."
- Bad: "Navigate to Point of Sale. It opens on the Dashboard, with a card for each shop." Stop after the click; the tester sees what opens.
- Bad: "click Project (type Project in the search bar if you cannot see it)". No asides for a case the tester is unlikely to hit.

**One-off windows stay out of the hint.** Some windows open once per database and then
never again: "Configure your document layout" on the first Send, a first-use tip, a
setup banner. A tester who has used the database before never sees them, and the one who
does can read the window. Give auto play an `"optional": true` action for it with a small
`timeout_ms` (about 500) so the play survives it, and write the hint for the normal flow.
- Good: "Press Send, then Send in the email window." (auto play has an optional Continue
  on the layout window)
- Bad: "Press Send, press Continue if a window asks you to configure your document
  layout, then press Send in the email window."

**Leave out what the tester does not touch.** A hint names only the fields the step needs
filled. "Keep or change the Quantity", "keep the rest of the row as it is" and "leave the
email as it is" are words about doing nothing; drop them, and drop the auto play actions
that set those fields, so Guide me does not point at them either. The step's domain may
still check them when their defaults already pass (a quantity of 1 satisfies `> 0`).
- Good: "On the Products tab press Add a product, select the product and save."
- Bad: the same with "keep or change the Quantity", and auto play typing 12 into it.

**Write it as directions a person would give.** Use "set Provider to Unknown", not "Provider = Unknown". Leave out filler: "simply", "ensure", "make sure", "in order to", "please note", "successfully".

**Don't ask for exact values.** Ask for the kind of thing the tester enters, not the figure auto play happens to type. A tester walking the scenario by hand picks their own price and quantity, and a name, hint or domain that demands one figure leaves them stuck on a requirement that does not matter.
- Good: "Add a sale line with a price."
- Bad: "Add a sale line with a price of $1.23."
- Name a value only when the journey depends on it: a credit limit the order must cross, an amount that needs approval. Then say why in the hint ("over the customer's 5,000 credit limit"), and make the domain check the condition (`amount_total > 5000`), not one exact figure.

## Categorising a scenario

The tester's list is grouped: each `category` is a collapsed section header carrying a
completed/total count, so a tester can open the app area they were asked to test and see
how much of it is left.

**Group only where it helps.** A category earns its place when it gathers several
scenarios a tester would work through together. A section holding a single scenario is
just an extra click to open it, so don't give a scenario a category of its own: use one
its neighbours already share, or leave `category` out when none fits. Uncategorised
scenarios fall into *Miscellaneous* at the bottom of the list, so when most of a set
would end up there, that is a sign to pick a broader shared category instead.

`category` [optional] — one slug, `^[a-z0-9][a-z0-9_]*$` (lowercase, digits and
underscores; no spaces, hyphens or capitals). It names the **Odoo app area the journey
belongs to**, as the business would say it — not the module and not the journey itself.
The panel shows it uppercased with underscores as spaces, so `point_of_sale` reads as POINT OF SALE.
- Good: `accounting`, `inventory`, `field_service`
- Bad: `olaunch_testflight_account` — that is the module; the module name is already
  dropped from the scenario's meta line once it has a category.
- Bad: `quote_to_cash` — that is the journey, which is what `name` is for.

**Reuse the existing vocabulary — never invent a spelling.** Grouping is by exact string,
so `sale` and `sales` are two separate sections and neither shows the full count. Before
choosing one, look at what the neighbouring scenarios already use:

```bash
grep -rho '"category": *"[a-z0-9_]*"' --include='*.json' . | sort -u
```

In use today: `accounting`, `crm`, `discuss`, `documents`, `email_marketing`, `events`,
`expenses`, `field_service`, `frontdesk`, `helpdesk`, `internal`, `inventory`,
`manufacturing`, `payroll`, `planning`, `point_of_sale`, `portal`, `project`, `purchase`,
`recruitment`, `rental`, `sale`, `sign`, `social`, `subscriptions`, `surveys`,
`time_off`, `timesheets`.

`tags` [optional] — up to 16 slugs, same pattern. Where a category says *which app area*,
tags say *what kind of testing this is*, cutting across app areas: a UAT manager filters
on them to pull a set together. A scenario sits in exactly one category but may carry
several tags. They show as blue chips before the audience chips.
- Good: `onboarding` (the go-live pass), `month_end`, `portal`
- Bad: a tag that repeats the category or the module — it buys nothing and clutters the row.

The search box matches on category and tag as well as name, module and group names, so a
tester typing "onboarding" or "inventory" finds the same handful of scenarios either way.
Searching also expands every matching group, so a collapsed section never hides a hit.

## Test Scenario Steps
- Each step should cover a single action the user would do in the given scenario.

**The tester starts on the home screen and may not know where anything is.** Pressing
Start drops them on Odoo's Home menu (see **Every flight starts on the home screen**), and
the person flying the scenario is often new to Odoo or to this app. So the step list
itself, not just auto play, must walk them from there to the work:

- **Step 1 usually opens the screen the journey begins on**, as its own
  `wait_window_action` (or `wait_client_action` / `wait_route`) step, with the menu path
  in its hint. It does not have to be a navigation step, but whatever step 1 is, its hint
  must get the tester there from the home screen. A list that opens on "Enter the
  quantity you counted" with no route leaves the tester staring at the Home menu with
  nothing ticking and no idea which app to click.
- **Add an "open" step every time the work moves to a screen the tester is not already
  on**, unless a button in front of them leads there (a smart button, a dashboard card),
  in which case the hint of the step that needs it names that button.
- **Name it for the screen, hint the route.** Name: "Open the physical inventory" · Hint:
  "Navigate to Inventory > Operations > Physical Inventory." Not "Go to Inventory", which names the
  app but not where in it.
- **A screen step's name says what ticks it.** A step watching a list open ticks the moment
  the list shows, so call it "Open your orders", not "Find the sale in your orders": a
  tester told to find something sees the step tick before they have looked. Opening one
  record cannot be watched, so a step can never wait for the tester to open the record
  they found. And never promise where the record sits ("the top row"): another tester's
  newer record may be above it.
- **Opening a record is part of the step that works on it**, not a separate step: the
  hint says how to find it ("Find {{product|the product}} in the list").
- Skip the opening step only when setup ends with an `open` line, which starts the flight
  on that record's form.

Check the list by reading it as someone who has never used the app: from the home
screen, does each step's name and hint tell them where to click next?

#### Where each step starts

"A screen the tester is not already on" means not on it **by every route the previous
step allows**, not just the one you scripted. Get this wrong and the step's hint names a
button that is nowhere on screen, Guide me has nothing to point at, and the tester is stuck.

- **A step that watches a record change ticks however the tester made the change.** A stage
  dragged on the pipeline instead of picked on the form, a quick-create on the kanban
  instead of the form, a save from the list: each ticks the step and leaves the tester on
  a different screen from the one auto play ends on.
- **Between steps a tester wanders.** They go back to the list to see the result, use the
  breadcrumb, look something up or reload the page. The next step cannot assume they are
  where the last one ended.
- **So a step may lean on the screen it starts on only when that screen is guaranteed**:
  the previous step is a `wait_window_action` / `wait_client_action` / `wait_route` for
  that very screen, or the previous step's last action opened the dialog this step
  finishes. Otherwise the step's own route goes first in its auto play actions.
- **The route lives in the actions, not the hint.** Write the hint for the tester who has
  just finished the previous step: it starts from the screen that step leaves them on and
  says what to do next. Guide me follows the actions and skips a route whose screen is
  already showing, so it only leads a tester back who did the previous step another way
  or wandered off. A hint that also explains the way back ("If the invoice is not on
  screen, navigate to … and click …") reads as if the previous step never happened, and
  pushes the hint past two sentences.
  - Good (the previous step saved the new invoice): "Under Invoice Lines press Add a line,
    select a product and save." Its actions still open the invoice
    from Accounting > Customers > Invoices first.
  - Bad: "If the invoice is not on screen, navigate to Accounting > Customers > Invoices
    and click the one for the customer. Under Invoice Lines press Add a line…"
  - When the previous step's normal route leaves the tester on another screen (the list
    after a save, the board after a quick-add), the hint starts from that screen: "Click
    the opportunity's card to open it, then press Activity…"
- **Use a route that works from anywhere.** `open_record` with `menu` and `search`, or
  `open_menu`, works whatever screen the tester is on. A `click_row` on a kanban card or a
  `click_button` on the form only works from that one screen, so it cannot be a step's
  first action unless that screen is guaranteed.
- **Follow every route click with a `wait` for what it shows.** A route through
  plain clicks (a sidebar entry, a folder, a tab) needs each click followed by a `wait`
  whose selector is true only once the click has done its work: `.o_last_breadcrumb_item:contains('My Drive')`
  after clicking My Drive, the folder's breadcrumb after opening it. Guide me reads those
  waits to skip the clicks whose result is already on screen, so a tester already inside
  their folder is pointed at the file, not sent back to My Drive. A click with no `wait`
  after it is treated as part of the job and always pointed at. (Older TestFlight clients point at
  every click; the `wait`s do no harm there.)
- **A route needs something unique to search for.** A record that still carries a
  template's or a default name (a new appointment called "Meeting", a draft with no number
  yet) cannot be found by search: the first match may be another record, on a customer
  database just as on a test one. Until the record has a name of its own, let the step work
  on the form the previous step's last action opened, and give the route to later steps.
- **Pick a record by its name, never by its position.** `:first`, `:last` or `:eq(n)` on
  a list row, a card or a folder picks whatever the screen shows there, and that changes
  under you: another tester's newer folder sits above the one this tester just made, even
  in a view sorted newest first. Pick a setup record by the flight's own name
  (`:contains('{{customer}}')`), and a record the tester made and named themselves by the
  name an earlier step captured (`:contains('{{step_2}}')`, see **`{{step_N}}`** below).
  Never pick by the name auto play typed for a record the tester names: Guide me then
  finds nothing for anyone who chose their own name.
- **The Guide me test.** Fly each step by hand under Guide me from where the previous step
  left you, and once more after going back to the home screen. If the pointer is nowhere
  at the start of a step, the thing it wants to point at is on another screen, and the
  step is missing its route there. A step that only works straight after the one before
  it fails the first tester who did that step another way.

- Each step has `id` (unique, 1-based), `name`, `type`, and one payload key named `type_<type>`. It may also carry `hint`, `optional` and `autoplay`.

`hint` [optional] — **how to complete the step**, shown to the tester under the step name while they are working on it, and gone once it ticks. The name says *what* must happen; the hint says *how*. It is the **only place a plan may name a menu or a button**, and where a customisation that would surprise the tester belongs ("this database replaces the inline line editor with a Create Order Lines dialog").

Write it for someone doing the job for the first time, in the same voice as the name:

- **One sentence, two at most.** It is read standing up, mid-task. If it needs three, the step is doing too much — split it.
- **Say where, then what.** The screen or section first, then the action: "Under Invoice Lines, add the product." A tester who cannot find the field never gets to the verb.
- **Write a menu path as "Navigate to App > Section > Menu".** Put "Navigate to" in front of it ("navigate to" mid-sentence), and write the menu names exactly as the menu shows them, joined by ` > `, with nothing around them: no brackets, quotes, backticks or bold. When the app itself is the destination, the path is just the app: "Navigate to CRM." Use this one form for every route, never "On the Home menu, click …" or "Open …". The panel finds a path written this way and sets it in italics, so it stands out from the instruction around it. A path names the menu, not the page; when the page it opens has another title, say so after it ("Navigate to CRM > Sales > My Pipeline, which opens the Pipeline page").
  - Good: "Navigate to Accounting > Customers > Invoices and click the one for {{customer|the customer}}."
  - Bad: "Open it from the Pipeline page (CRM > Sales > My Pipeline)." The path is in brackets, with no "navigate to".
  - Bad: "Accounting > Customers > Invoices." A bare path is not an instruction.
- **Only name a control the tester must find.** "Press Confirm at the top of the invoice" earns its place; "press Save" after every step does not.
- **Never ask for work the form already did.** A pre-filled price, a default payment term, a date that lands on today — the tester will hunt for a field they do not need to touch. See the gotchas below.
- **No technical vocabulary**, same as the name: no method, model or field names, no external ids. Say "the delivery", not "`stock.picking`".
- **"Keep the defaults" only where there is something to keep.** Say it when a window offers choices a newcomer may think they must make (an activity's type, summary and due date; an email's recipients; cash amounts), so they press the button instead of filling everything in. A window that only shows a value and its buttons (a share link with Copy Link & Close) needs no such note: name the button and stop.
  - Good: "Press Activity, keep the defaults and press Save."
  - Bad: "Press Share at the top, keep the settings in the window that opens and press Copy Link & Close." The window has nothing to keep.
- **Leave out what the step already tells them.** Do not restate the name, do not describe the outcome, and never say what not to do.
- **Let the tester name what they create.** Never tell them what to call a record they make themselves ("name it TF Sub-category {{run}}"): people type their own name anyway, and every later hint that refers to the dictated name then points them at something that does not exist. Say "give it a name", and refer back to it by its role ("your new sub-category", "your list"). Naming with `{{run}}` is for records **setup** creates. Auto play may still type a `{{run}}` name of its own, but mark that `set_field` with `"any_value": true`, or Guide me's pointer shows "Set Name to TF …" and dictates the name the hint just left open. The same goes for any free text the tester writes (a subject, a note, a reason).
- **Point at the record setup made for the step.** When setup creates the record a step works on, the hint names it: "Open {{inventory|the shelf count}} and press Begin Adjustments." Do not write "open any suitable draft adjustment". A tester then has to judge what counts as suitable, may pick a real record, and the step's watch, which pins the setup record, never ticks. Leave the choice open only when the choice itself is part of the test (the tester picks the customer, the product, the quantity). The step's domain must then accept any record, not just the setup one.
- **Say nothing rather than something empty.** `hint` is optional. "Open the Sales app" needs no hint; a step that would only get "follow the usual process" is better without one.

Hints that earn their place, and hints that do not:

- Good: "Navigate to Accounting > Customers > Invoices."
- Good: "Press Confirm at the top of the invoice."
- Good: "Under Invoice Lines, add the product; the Unit Price fills in from the product."
- Bad: "Add the invoice line." — restates the name.
- Bad: "Under Invoice Lines, add the product and enter the agreed Unit Price." — asks for a value the form pre-fills.
- Bad: "Add a line, set the quantity, apply the discount, then save and check the total." — four steps wearing one hint.

`optional` [optional] — the run does not depend on this step. The tester may skip it and the panel does not count it as outstanding; auto play skips it when it carries no actions.

**`wait_window_action`** — the tester opened a screen.
```json
{"id": 1, "name": "Open Sales", "type": "wait_window_action",
 "type_wait_window_action": {"ext_id_ref": "sale.action_quotations_with_onboarding"}}
```
`""` means any window action. This is the step type for the screen-opening steps most scenarios start with (see above): it ticks when the tester reaches that screen, however they got there.

**`wait_record`** — a record was created/changed, or a method ran.
```json
{"id": 3, "name": "Quote for that contact", "type": "wait_record",
 "type_wait_record": {
     "res_model": "sale.order",
     "trigger": "orm_update",
     "target": "new_records",
     "conditions": [{"type": "field_match_captured_record",
                     "type_field_match_captured_record": {"field": "partner_id", "step_id": 2}}],
     "domain": [["state", "=", "draft"]]
 }}
```

| Key | Values |
|---|---|
| `trigger` | `orm_update` (create/write) · `execute_kw` (+ `trigger_execute_kw.func_name`) — **last resort, it shows the tester the method name** |
| `target` | `new_records` (create) · `existing_records` (write) · `matched_record` (+ `target_matched_record.step_id`) |
| `conditions` | `field_match_captured_record` (`field`, `step_id`) · `field_match_ext_ref_id` (`field`, `ext_ref_id`) — all must hold |
| `domain` | Odoo domain, **lists not tuples** (JSON has no tuples) |
| `changed_fields` | `orm_update` only — the write must have touched one of these fields |

Condition `field` must be a **many2one on `res_model`**, and any `step_id` must refer to an **earlier** step. Inserting or removing a step renumbers the ones after it: update every `step_id` that points past the change, in conditions as well as targets. The validator cannot tell an off-by-one reference from a deliberate one, and the step it breaks simply never ticks.

`changed_fields` is the answer to a step that ticks the moment it is opened. A `domain` says what the record looks like *now*, which a record already in that state satisfies without the tester doing anything; `changed_fields` says the write in front of you is the one that put it there. Use it whenever the outcome is a field the record may already hold — a state, a stamp, a date.

```json
{"id": 10, "name": "Mark the order ready for dispatch", "type": "wait_record",
 "type_wait_record": {
     "res_model": "sale.order", "trigger": "orm_update", "target": "matched_record",
     "target_matched_record": {"step_id": 2}, "conditions": [],
     "changed_fields": ["state"],
     "domain": [["state", "!=", "draft"]]
 }}
```

**`wait_client_action`** — the tester opened an OWL client action (Shop Floor, Barcode, a dashboard). These are not window actions, so name the registry `tag` (or `ext_id_ref` of the `ir.actions.client`); both empty means any client action.
```json
{"id": 1, "name": "Open Shop Floor", "type": "wait_client_action",
 "type_wait_client_action": {"tag": "mrp_workorder_shop_floor"}}
```

**`wait_route`** — the tester's browser hit an HTTP route. This is the only way to watch a screen that talks to its own controllers instead of the ORM: the Barcode app, and every portal page. `match` is `exact` (default) or `prefix`, which is how you watch a route with a record id in it. A prefix matches whole path segments: `/shop` matches `/shop`, `/shop/` and `/shop/category/x`, never `/shopping`. End the route with `/` (`/my/orders/`) to match only the pages below it, such as one order, and not the list itself. (On builds before olaunch_testflight 16.0.1.3.0, 17.0.1.3.0, 18.0.1.3.0, 19.0.1.2.0 or 20.0.1.2.1, `prefix` matches only paths below the route, never the route itself: watch the list with `exact`.)
```json
{"id": 2, "name": "Open the order in the portal", "type": "wait_route",
 "type_wait_route": {"route": "/my/orders", "match": "prefix"}}
```

## Setup (optional)

A scenario may carry a top-level **`setup`** list: ordered ORM calls run when the flight starts (manual **Start** and auto play's **Play** alike), as the logged-in tester, purely through the ORM — never the tour engine. Use it to build the data the scenario needs. A failing entry refuses the launch with the line named, and the transaction rolls back so nothing half-built remains.

Each entry is a 4-item array, run in order so later entries can use earlier variables:

```json
"setup": [
    ["create", "partner", "res.partner", {"name": "Test Customer"}],
    ["create", "sale", "sale.order", {"partner_id": "{{partner}}"}],
    ["write", "{{sale}}", "sale.order", {"client_order_ref": "TF-{{partner.id}}"}],
    ["write", "base.main_company", "res.company", {"phone": "5550 1234"}]
]
```

- `["create", "var_name", "model.name", {vals}]` creates a record and binds it to `{{var_name}}` for everything after.
- `["write", ref, "model.name", {vals}]` writes to `ref`: a database id, `"{{var_name}}"` from an earlier create, or an xml id like `"base.main_company"`.
- `["find", "var_name", "model.name", {spec}]` binds an EXISTING record — `{"xmlid": "module.record"}` or `{"domain": [...], "order"?}` (first match), plus an optional `"message"` shown when nothing matches. Use it to point at data the database already holds (a cost centre, a product variant, a rate row); a find that matches nothing refuses the launch, so it doubles as a precondition. Add `"create": {vals}` to make the record instead when nothing matches: `["find", "product", "product.product", {"domain": [["sale_ok", "=", true], ["type", "=", "service"]], "create": {"name": "TF Service {{run}}", "type": "service", "list_price": 100}, "message": "There is no service product to invoice."}]` uses an existing service product and creates one on a database that has none. The vals render like a `create` entry's (`{{run}}` in the name, as for any record setup makes). The record is created with the tester's rights, so where those do not allow it the launch is still refused, with `message` and the reason. Builds without this key refuse it at validation.
- `["call", ref, "model.name", {"method": "...", "args"?, "kwargs"?, "bind"?}]` invokes a public method on the record `ref` resolves to, exactly as a button click would (tester's rights; `_`-prefixed methods refused). `bind` names a variable for a returned record — how setup reaches outcomes only business logic can produce (a validation that commits a whole structure, a conversion).
- `["open", "model.name", ref]` — the tester starts the flight on that record's form instead of the home screen (see **Every flight starts on the home screen**). `ref` resolves like a write's: `"{{var}}"`, an id or an xml id. Use at most one, as the last line.
- In vals, a string that IS `"{{var}}"` becomes the record's **id** (what a many2one wants — also inside x2many commands like `[[6, 0, ["{{tag}}"]]]`); `"{{var.field.path}}"` becomes the field's value; either inside a longer string becomes text.
- Built-in dates work in every setup string without declaration, each accepting a ±N day offset: `{{today}}` (user's format), `{{today_iso}}`, `{{quarter_start_iso}}` / `{{quarter_end_iso}}`, `{{year_start_iso}}` / `{{year_end_iso}}` — e.g. `"{{today_iso+30}}"`, `"{{quarter_end_iso-1}}"`. Use them instead of literal dates.
- `{{step_N}}` is the name of the record step `N` captured, once step `N` has ticked: the
  folder the tester made and named in step 2 is `{{step_2}}` to every later step's auto play
  actions, so a later step can click that very folder (`.o_folder_record:contains('{{step_2}}')`)
  whatever the tester called it. Only steps after `N` may use it (the validator refuses
  earlier ones), it is text only (no `.id` or `.field`), and it is empty for a step that
  captures nothing or a record with no name. Needs a current TestFlight client.
- `{{user}}` is the tester running the flight, bound before the first setup line without declaration: `"user_id": "{{user.id}}"`, `"name": "Test client for {{user.name}}"`, or as the `ref` of a write/call. Make fixture data theirs so the record they are sent to is one they may see. Setup vars and these templates render in setup vals, names, hints and autoplay strings only — a `wait_record` step domain is evaluated server-side untemplated, so never put `{{var}}` there.
- `{{run}}` is a 4-character code unique to the flight (`K7Q2`), bound before the first setup line. **Put it in the name of every record setup creates that the tester has to find**: `"name": "TF Customer {{run}}"`, which reads "TF Customer K7Q2". Keep these names short: "TF", one or two words for what the record is, then the code. They show in lists, cards, breadcrumbs and the panel, and a long name ("TESTFLIGHT Invoice Customer K7Q2") crowds every one of them. Pick the words from the field the tester will choose the record in, so the name matches the label beside it: "TF Customer" for the invoice's Customer, "TF Vendor" for the purchase order's Vendor, "TF Employee", "TF Product", "TF Task". A generic "TF Contact" leaves a tester unsure whether it is the right one for the field in front of them; use it only where the field is labelled Contact. Two records of the same kind get different words ("TF Customer {{run}}", "TF Vendor {{run}}"), not a number: there is no counter, and `{{run}}` is the only value unique to the flight. Setup builds fresh records every flight and never removes old ones, so without the code "TF Customer" matches every copy earlier flights left behind — the tester (and auto play) can open the wrong one, and a step watching this flight's record never ticks. Hints then name the record with its var (`Open {{customer|the customer}} in Contacts`) so the tester sees the exact name. Before a flight starts `{{run}}` renders empty. Because step domains are untemplated, a tick domain on such a name must match the prefix: `["partner_id.name", "=like", "TF Customer%"]`, never `=`. The same prefix in another scenario does no harm: a flight's steps only see that tester's work in that flight. Records with a unique number of their own (sale orders, transfers, posted invoices) need no code: find them by `{{var}}`.
- **A record the tester creates is never ticked by its name.** They choose the name (see `hint`), so a domain like `["name", "=like", "TF Opportunity%"]` never ticks for the one they called "Big roof job". Pin it by what links it to the flight instead: a field pointing at a setup record (`["parent_id.name", "=like", "TF Category%"]`, `["partner_id.name", "=like", "TF Customer%"]`) on a `new_records` watch, then follow it in later steps with `matched_record` or a `field_match_captured_record` condition.

**Setup runs as the tester, with their access rights.** A field the tester's group cannot write refuses the launch for every real tester, even though the flight works as admin. PowA's Website Editor and Designer users cannot set a product's internal reference (`default_code`), so a setup line writing it made the flight unlaunchable for the marketing team it was written for. Only set fields the scenario's `allowed_groups` may write, and fly the scenario as one of those users before handing it over (see **Testing a scenario end to end** below). When a field the tester cannot write is part of the fixture, find an existing record that already has it instead of creating one.

**Find setup records by their `{{run}}` code, not their full name,** when the database searches fuzzily. A customer database that adds product search on several fields (description, barcode, supplier code) or splits words can return several earlier flights' records for a full name. Search on the code alone (`"search": "{{run}}"` or `[["name", "ilike", "{{run}}"]]` in a resolver), because it is unique to the flight.

**Hints** may hold `{{var.field.path|placeholder}}`: the record's value once the run starts, the placeholder before it — `"Open sale order {{sale.display_name|the new sale order}}"` reads "Open sale order S00042" mid-run. Step names render the same templates, but keep record names out of them (see **Step `name`**).

**With auto play**: setup runs BEFORE the autoplay vars resolve, so a resolver domain may target what setup just created (e.g. `[["id", "=", "{{sale.id}}"]]`), and resolver problems never take Play away on a plan with setup — they only stop it once the flight is running and setup has had its chance. Setup vars are usable in every autoplay string as `{{name}}` (display_name) and `{{name.id}}` without being declared in `vars`; an authored var of the same name wins. `{{name.field.path}}` works in autoplay strings too (a many2one gives its display name), on setup vars and on resolver vars; an unknown field takes Play away and says which. On builds before olaunch_testflight 16.0.1.3.0, 17.0.1.3.0, 18.0.1.3.0, 19.0.1.2.0 or 20.0.1.2.1, autoplay renders only `{{name}}` and `{{name.id}}` and leaves `{{name.field}}` as literal text, so put the value in its own setup var or resolver there.

## Auto play (optional)

A scenario may also carry an **`autoplay`** block. When it does, the TestFlight panel shows **Play / Stop** and can perform the steps itself, in the tester's own session, at human pace, with the tour pointer resting on each thing before it acts and a caption saying what it is doing. Nothing about ticking changes: the clicks and typing are real, so the ordinary engine sees the ORM writes and window actions exactly as for a person and ticks the step. **That tick is the player's assertion** -- after a step's actions ran it waits for the tick and moves on; no tick within the timeout stops the run and names the step. A scenario without `autoplay` behaves exactly as before, and a broken `autoplay` never blocks a manual run -- it only takes Play away, with the reason next to the button.

The same actions drive **Guide me**, which is always on while a flight runs (and steps aside while Play drives): instead of acting, Odoo's tour pointer shows the tester where each action happens and waits for them to do it. So autoplay actions double as the tester's directions -- another reason to write them as the route a person takes (see **Getting to a screen** below).

```json
{
    "schema_version": 1,
    "uid": "budget_create",
    "name": "…",
    "autoplay": {
        "vars": {
            "client": {"model": "res.partner", "domain": [["name", "ilike", "Demo"]], "order": "name"},
            "product": "Domestic Assistance"
        },
        "requires": [
            {"model": "res.partner", "domain": [["name", "=", "{{client}}"], ["phone", "!=", false]], "count": ">= 1",
             "message": "{{client}} must have had a phone number"}
        ],
        "step_delay_ms": 600, "pointer_ms": 500, "tick_timeout_s": 30,
        "preconditions": ["Providers with prices must exist for {{product}}"]
    },
    "steps": [
        {"id": 1, "name": "Open Contacts", "type": "wait_window_action",
         "type_wait_window_action": {"ext_id_ref": "contacts.action_contacts"},
         "hint": "Navigate to Contacts.",
         "autoplay": {"actions": [
             {"do": "open_menu", "menu": "contacts.menu_contacts"}
         ]}},
        {"id": 2, "name": "Add a note to the client", "type": "wait_record", "type_wait_record": {"…": "…"},
         "hint": "Find {{client|the client}} in the list, then use the Notes tab.",
         "autoplay": {"actions": [
             {"do": "search", "text": "{{client}}"},
             {"do": "click_row", "text": "{{client}}"},
             {"do": "open_tab", "label": "Notes"}
         ]}}
    ]
}
```

### Auto play json data

Store autoplay data in `{"autoplay": {...}}`

| Key | Meaning |
|---|---|
| `vars` | Named values, used as `{{name}}` in every autoplay string. A var is a **literal** (string/number/boolean) or a **resolver** `{"model", "domain", "field"?, "order"?}` — the first matching record, read at Play time, giving `{{name}}` (its `field`, default `display_name`) and `{{name.id}}`. Resolvers are how a script finds data that fits (a demo client with no budget yet) instead of naming one that may already be used up. **A resolver that matches nothing blocks Play** — unless the plan has `setup`, which runs first and may create the match. The panel shows every resolved value before Play and lets the tester type another; a typed value must still satisfy the resolver's domain. |
| `requires` | Preconditions `{"model", "domain", "count", "message"?}` evaluated with `search_count` **before anything moves**. `count` is an integer (exactly that many) or `"<op> <n>"` (`= == != < <= > >=`). A failing one blocks Play with its message — far better than dying on a missing element three clicks in. |
| `step_delay_ms` | Pause before each UI action (default 600). The panel's speed slider scales it live — leftmost is twice as slow, rightmost is instant (no pauses, no pointer dwell). |
| `pointer_ms` | How long the pointer rests on an element before acting (default 500); 0 hides it. |
| `action_timeout_ms` | How long to wait for an action's element (default 10000). |
| `tick_timeout_s` | After a step's actions ran, how long to wait for the tick (default 30). |
| `preconditions` | Prose shown before Play, for what a domain cannot check. |

### Autoplay Steps

Store autoplay step data with in each step's data `{"steps": [{"id": 1, "autoplay": {...}}]}`

`{"actions": [...], "requires"?: [...], "tick_timeout_s"?: n}` — the actions that make **this** step's outcome happen. Step `requires` are checked when the player reaches the step (guards a Play started mid-plan). A step **without** `autoplay` is left to the tester: the player waits until it is ticked by hand, then carries on. Optional steps without actions are skipped.

### Actions

Every action is `{"do": "<verb>", ...args}`. Common optional keys: `timeout_ms`, `delay_ms` (pause before this action, overriding `step_delay_ms`), `in_dialog` (`true` = only inside the topmost dialog; note an open dialog is searched first anyway, `false` forces the page behind it), `optional` (skip rather than fail when the element never appears), `caption` (what the pointer bubble says), `in_page` (`click`/`wait`/`raw` only: look inside the website page the backend's website preview or builder shows, not in the backend around it).

| Verb | Args | What it does |
|---|---|---|
| `open_menu` | `menu` (a menu xml id, e.g. `"crm.menu_crm_opportunities"`) — or, older, `path: ["Sales", "Support at Home", "Quarterly Budgets"]` | Clicks through the app, its menu-bar section (or "+", when the bar has folded it away) and the menu — the way a person navigates. **The default way to reach a screen.** With `menu`, every element is found by its xml id, so labels, language and screen width do not matter; `path` matches visible labels. |
| `open_action` | `ext_id` | Opens a window action directly through the action service. **Only for a screen a menu opens itself** — Play is refused, with the reason next to the button, when no menu the tester can see opens `ext_id`. Prefer `open_menu`. |
| `open_record` | `model`, `domain` (+`order`) or `id` (typically `"{{var.id}}"`), and **`menu` + `search`** (+ `row`) | With `menu` and `search` (the normal form): opens the menu, types `search` in the search box, drops the list's other filters only if they still hide the record, opens the row/card containing `row` (default `search`), then **checks the record open is the one `id`/`domain` names** and stops with a clear error if a different one opened. Guide me points along the same route. `search` must find exactly this flight's record: `"{{var}}"` of a record named with `{{run}}`, or one with its own unique number. Without `menu` it jumps straight to the record — only for records nothing on screen leads to; Guide me then points at the step's hint. |
| `search` | `text` | Types in the control-panel search box and presses Enter. |
| `click_row` | `text` | Opens the list row / kanban card containing the text. |
| `click` | `text` or `selector` (+ `within`) | Clicks a button, link, tile, card, menu item by visible text (exact text preferred over substring), or a jQuery selector. For a control Odoo shows only while its container is hovered — a kanban card's ⋮ menu — give the container as `within` and the control as `selector`: `{"do": "click", "within": ".o_kanban_record:contains('Delivery Orders')", "selector": ".o_dropdown_kanban button"}`. |
| `click_button` | `name` or `label` | Clicks a `<button name="…">` (its method/action) or a button by label — form header, sheet tiles, dialog footers. |
| `open_tab` | `label` | Opens a notebook page. |
| `set_field` | `field`, `value`, `list`? (existing lines only) | Fills a field by technical name, whatever its widget: text/number/date typed; a `<select>` or `selection_badge` or radio picked by label; a checkbox ticked/unticked (`true`/`false`); a many2one typed then picked from the dropdown (exact match preferred; "Create…" entries ignored). `list` = the one2many whose currently-editing row holds the field. `any_value: true` when the tester chooses the value (a name, subject or note they write themselves): Guide me then says "Fill in <field>" instead of "Set <field> to <value>" and accepts whatever they enter, while auto play still types `value`. Builds before olaunch_testflight 16.0.1.3.2, 17.0.1.3.2, 18.0.1.3.2, 19.0.1.2.2 or 20.0.1.2.2 reject the key. |
| `add_line` | `field`, `values`? | Presses "Add a line" on an editable one2many and fills `values` (`{"line_type": "Top-up", "amount": 15}`) on the new line in one go. Fill new lines here, not with later `set_field … list:` actions — an empty new line is discarded as soon as focus moves. |
| `attach` | `field` (or `selector`), `name`?, `text`? | Uploads a small generated file into an attachment field. A browser will not let page script read a path, so the file is built in memory -- this is the only way auto play can satisfy a journey gated on an attachment (a compliance that will not validate without its certificate). |
| `save` / `discard` | — | The form's Save/Discard, or the dialog's when one is open. |
| `press` | `key` (`Enter`, `Escape`, `Tab`, `ArrowDown`, `ArrowUp`) | Sends the key to the focused element. |
| `wait` | `ms` or `selector` or `text` | An explicit sync point. |
| `note` | `text` | Shows a caption on screen (narration); no UI effect. |
| `raw` | `trigger`, `run`, `extra_trigger`? | A verbatim Odoo tour step — the escape hatch. Prefer a verb: verbs are compiled per Odoo version, raw selectors are not. |
| `edit_website` | — | On a page the website preview shows (`open_menu` to `website.menu_website_preview` first): presses Edit and waits until the builder has made the page editable. A page already being edited is left as it is. |
| `edit_text` | `selector`, `value` | In the builder: replaces the text of the first page element matching `selector` (e.g. `"#wrap h1 strong"`) with `value`, the way Odoo's own website tours type into a page. Aim at the innermost element holding the words so the heading keeps its styling, and put `{{run}}` in `value` so Save always has a change to write. |
| `save_website` | — | Presses the builder's Save and waits for the builder to close. Saving a page writes its `ir.ui.view`, which is what a `wait_record` step on `ir.ui.view` (`key` = the page's key, `changed_fields` `arch`/`arch_db`) ticks on. |

`edit_website`, `edit_text`, `save_website` and `in_page` need olaunch_testflight 16.0.1.3.1, 17.0.1.3.1, 18.0.1.3.1 or 20.0.1.2.1, or a 19.0 build with ticket #89748 in (19.0.1.2.1 builds from before October 2026 lack it); older builds refuse them. The TestFlight panel stays on screen in the website preview and the builder from those builds too, with Play and Guide me working on the page. On 16.0–18.0 the builder is called the editor; the verbs are the same.

### Every flight starts on the home screen

Pressing Start (or Play) takes the tester to Odoo's home screen, whatever they had open — so write step 1 as the first thing a person does from there. It does not have to be a navigation step, but usually is: a step of its own that opens the screen the journey begins on, with its menu path in the hint and `open_menu` in its auto play. Never assume the tester is already somewhere. The screen they happened to be on when they pressed Start does not count towards any step.

When the journey genuinely begins on one record — a document the setup built for them to work on — end `setup` with an `open` line (`["open", "sale.order", "{{order}}"]`): the flight then starts on that record's form instead of the home screen.

### Getting to a screen: follow the menus

Play must only do what a tester can do, so **reach every screen the way a person does**:

1. **A menu opens it** → `{"do": "open_menu", "menu": "<menu xml id>"}`. Name the menu, not its action: many menus run a *server action* (CRM > Sales > My Pipeline, Inventory > Operations > Transfers > Receipts, Replenishment) that returns the window action, so no menu opens that window action directly and an `open_action` on it is refused.
2. **A button on another screen opens it** (a dashboard card's "To Process" or "Back Orders", a smart button) → `open_menu` to that screen, then `click` the button, e.g. `{"do": "open_menu", "menu": "stock.stock_picking_type_menu"}` then `{"do": "click", "selector": ".o_kanban_record:contains('Delivery Orders'):contains('{{warehouse}}') button[name='get_action_picking_tree_ready']"}`.
3. **Nothing on screen leads there** → the step is not something a tester can do; rethink the step rather than teleport with `open_action`.

**Already on a related record? Use its smart button, not the menus.** A route back through the home screen is for getting somewhere from scratch. When the tester is already on a record linked to the next one — a sale order and its delivery, a delivery and its sale order, an invoice and its payments, a customer and their orders — they follow the smart button (stat button) or link on screen, and so should the step: `{"do": "click_button", "name": "action_view_delivery", "caption": "Delivery"}` from the sale order, not `open_record` on the delivery through Inventory. Guide me then points at the button right in front of them, and Play proves the link works. Find the button's `name` in the form view (`<button name="..." type="object|action">` in the smart button box). When the step ends on another record of the same list, the breadcrumb back to that list is the person's route too. Reserve `open_record` + `menu` + `search` for a record nothing on the current screen leads to.

A `wait_window_action` step still ticks on the window action however it was reached, so the step's `ext_id_ref` does not change when its autoplay moves from `open_action` to `open_menu`.

**Finding a menu's xml id**: in developer mode, Settings > Technical > User Interface > Menu Items, open the menu and read its External ID; or, on the navbar, every app, section and menu element carries it as `data-menu-xmlid`. From a database shell:

```sql
select d.module || '.' || d.name as xmlid, coalesce(m.name->>'en_AU', m.name->>'en_US') as name, m.action
from ir_ui_menu m join ir_model_data d on d.model = 'ir.ui.menu' and d.res_id = m.id
where coalesce(m.name->>'en_AU', m.name->>'en_US') ilike '%pipeline%';
```

The validator checks each `open_menu` `menu` exists and is visible to the tester, and each `open_action` has a menu that opens it; either failure takes Play away and names the step.

### Autoplay common issues and hints

- **Author the actions for the outcome the step watches.** If a step watches a `sale.order` create, its actions must end on the Save that creates it — not one action short. The tick is the check.
- **Built-in vars**: `{{today}}` (the user's date format, what a date field accepts when typed), `{{today_iso}}` (for domains), `{{user}}` / `{{user.id}}` (the tester, a bound record) and `{{run}}` (the flight's code) exist without being declared.
- **Vars are resolved once, at Play.** A resolver picks by `order` then first; give it an `order` so the choice is stable and name the family (`name ilike "Demo"`) so it never lands on real data.
- **`{{name.id}}` and `{{name.field}}` only exist for records** (resolvers and setup vars). The validator refuses them on a literal.
- **Steps that tick early** (a `wait_window_action` satisfied by the first click) still get all their actions run. They set up the next step.
- **Labels are user-facing strings**; `click`, `open_tab` and `open_menu` by `path` prefer an exact match but fall back to substring, so "Sales" is safe next to "Point of Sale" only when the exact label exists. Labels also follow the tester's language (PowA runs en_AU: Accounting > *Customers* reads Accounting > *Sales*) — `open_menu` by `menu` xml id sidesteps both.
- The panel's **Stop** halts between actions; the run stays open, so the tester can continue by hand or press Play again to resume from the first outstanding step.
- **New can be a dropdown.** Where a database has templates (quotation templates in Sales, task templates in a project), New opens a menu ("New Quotation" / "New Task" and the templates) instead of a blank record, and a scenario finds a project or app that has them on some databases and not others. After New, add an optional `click` on the plain entry with a short `timeout_ms`, and leave it out of the hint: where the menu opens, Guide me points at the entry, and a hint aside for a menu that may not appear is only words to read.
- **A toggle on a new record saves it.** A boolean or toggle widget (Published, Active, a priority star) on a record that has never been saved writes the record the moment it is clicked. A step "add the banner and publish it" then ticks its create and its publish on one click, or the publish fails on a half-filled record. Split it: one step creates and saves, the next one publishes.
- **A Save inside an x2many dialog may or may not save the parent.** Saving a line's dialog (a product's video, an order line's form) writes the parent too on some screens and only stages the line on others. Script the parent's `save` as `"optional": true` after the dialog's Save, and watch the line's own record, not the parent's write.
- **A step with no autoplay actions is manual.** Play waits for the tester to do it, or with `manual: "stop"` ends there and leaves the rest unverified rather than failing. Keep manual steps last, after every step auto play can do, so Play proves as much of the flight as it can.

## Full-screen and website-editor screens

Some screens take over the whole page: the POS, the Shop Floor and Barcode apps, the portal, and on older builds the website preview and builder. The TestFlight panel cannot sit beside them, so it shrinks to a read-only progress card. On builds with #89748 (see `edit_website` above) the website preview and builder keep the panel, and Play and Guide me work on the page through `edit_website`, `edit_text`, `save_website` and `in_page`. On those screens:

- **Play and Guide me stop** on builds without #89748: neither can act or point inside the website preview or builder. Write the backend part of the journey first and give it autoplay actions, then put the website steps last with no autoplay actions. They are manual steps (see above).
- **"Go to Website" moves the whole page.** It replaces the backend with the frontend, which stops Play, so a step that presses it is the last step Play can do. Opening the Website app from the app menu does the same on builds without #89748; with it, the preview opens inside the backend and Play carries on.
- **The Website app opens on the home page preview.** A `wait_route` on `/` (or a home-page route) ticks the moment the app opens, before the tester has done anything. Watch the page the step is actually about, or the `ir.ui.view` write the edit makes.
- **Builder edits tick on the view write.** Saving in the builder writes `ir.ui.view` (and `website.page` for page settings). Watch that write with `orm_update`, narrowed to the view's `key` or the page's `url`, not a route.
- **Never save in the builder during a flight on an unfixed build** (#89757). Before olaunch_testflight 16.0.1.2.0, 18.0.1.2.0, 19.0.1.2.0 or 20.0.1.2.1 (17.0 never had the problem), the save writes the progress card into the page, copies around 15 website views, then fails with an XPath error. Check the installed version before scripting a builder Save; on an unfixed build end the scenario before the Save, or have the tester discard instead.
- **The card may refresh late.** On builds before olaunch_testflight 16.0.1.2.0, 18.0.1.2.0, 19.0.1.2.0 or 20.0.1.2.1 a step that ticks inside the preview only shows as ticked once the tester returns to the backend. Do not make the tester reload for it.

## Authoring against a live customised database

A scenario written against vanilla Odoo rarely survives contact with a customer database. These are the habits that make one that does.

**Use isolated fixture data, never the customer's live records.** Name a family of records for TestFlight — a `TF …` name, a `TF-…` origin, partner ref or product code — and point every resolver and requirement at it. A scenario that picks the first real open order will one day be run twice, or run on the order someone is actually shipping. Say so in `preconditions` so the tester knows the journey stands on its own data.

**Every record a step relies on comes from setup.** A scenario is installed on databases
you have never seen. Any record the hints name or the journey needs — a team, a shop, a
stage, a payment method, a product, an employee — may be missing, archived or renamed
there. So none is written into the scenario by name: setup `find`s each one, the hints
show it through `{{var}}`, and the `find` has a `create` fallback that builds a working one
when nothing suitable exists. Chain the fallbacks when a record needs another first (a
shop needs a cash payment method, which needs a cash journal). Placeholders after `|` are
generic ("the next stage"), never a name from Odoo's data. Before calling a scenario
done, read every hint and step for a record name and prove each create fallback works by
running setup with the finds forced to miss (add `["id", "=", 0]` to each domain in a
rolled-back shell).
- Good: setup finds `next_stage` among the pipeline's stages after the first; hint "click
  the {{next_stage|next}} stage".
- Bad: "click the Qualified stage" — the customer may have renamed or removed it.
- Bad: "choose Cash" — the shop's cash method may be called anything.

**Never depend on demo data.** A scenario runs on customer databases that never loaded
Odoo's demo data, so a setup `find` must match by what any working database has — a role,
a property, a setting — never a demo xml id (`project.project_project_3`, "Renovations")
or a demo-only marker (an `@example.com` email, a demo product's name). Check an xml id's
source before using it: one defined in a module's `*_demo.xml` exists only with demo data.
One in its data files (`helpdesk.helpdesk_team1`) is no better for business data: the
customer may have archived, deleted or renamed it, and it belongs to one company. Find
business data (a team, project, stage, product) by a domain that matches the first
suitable record in the tester's company (`["company_id", "=", "{{user.company_id.id}}"]`,
ordered as the screen orders them) and let the hint name it with `{{var}}`. Keep xml ids
for what a module's code defines and recreates on every upgrade: menus, actions, views,
groups, and core records nothing works without (`mail.mt_note`). Give a `find` for ordinary
business data (a product, a project, a stage) a `create` fallback, so a database that has
none still gets one. When the record is
there only to keep email away from real people (a guest to invite, a colleague to share
with), create it in setup with an `@example.invalid` address instead; when the tester's
rights do not allow creating it, say so in `preconditions` and pick a recipient who
expects the email (the tester themselves, or a colleague named in the hint).

**Make `requires` prove the fixture, not just the model.** The useful requirement is the one that fails on the missing precondition three clicks before the player would die on a missing button — "both component lines must have non-zero BoM cost shares", "the receipt must have its quantity prepared". Requirements may interpolate a resolved var, including `{{var.id}}`, so a later requirement can check the exact record an earlier resolver picked.

**Resolve records by id when the actions need to open them.** A resolver with `"field": "id"` gives `{{var}}` as the id for `open_record`, while `{{var.id}}` is available on any resolver for use inside a domain.

**Watch what the system does on its own.** In a customised database the interesting outcome is usually a side effect: an automation stamps a date, validating a delivery raises the balance invoice, a deposit payment releases shipping. Give that outcome its own step with `target: matched_record` back to the record an earlier step captured, and let the step's only autoplay action be a `note` saying what just happened. The step ticks when the server does the work, and the tester is told why it mattered.

**End where the tester would check, when that is somewhere else.** Most journeys verify themselves: the invoice posts or the order confirms in front of the tester, and a further step would only make them look at what they just saw. Ask how a real user would satisfy themselves the job worked. If the answer is "go to another screen" (the product's On Hand after a stock count, the customer's balance after a payment, a report after a posting), finish with a step that takes them there. Watch it with `wait_window_action` on that screen's action, give it a `menu` or `open_record` route in auto play, and say in the hint what figure they should see ("On Hand now shows the 4 you counted"). Use that step only when the tester would really go and look. Do not add it by habit.

**Re-open the record at the top of a step that needs it.** Steps are not a single continuous form session — a previous step may have left the tester on an invoice or a wizard, or the tester may have done it by another route and be somewhere else entirely (see **Where each step starts**). Start such a step with `open_record` with its `menu` and `search` — the way the tester gets back to it — rather than assuming the right record is on screen. For a record the tester created in an earlier step, `domain` (plus `"order": "id desc"`) names it and `search` repeats the unique text they typed.

**Mark actions `optional` where the UI legitimately varies.** Check Availability may already be done, an immediate-transfer dialog may not appear, an invoice may already be posted. `{"optional": true}` skips the action instead of failing the run.

**Wizards are the norm, so `in_dialog` is the norm.** A customised confirm can be a multi-page wizard: `click_button` the opening action, then `action_next_page` through it `in_dialog`, then the final confirm. Fields set inside a wizard need `"in_dialog": true` too.

**Put a `wait` after an action that makes the server think.** Posting, validating and product-configurator changes re-render the form; an explicit `{"do": "wait", "ms": 2000}` before the next action costs a moment and saves a flaky run. Prefer waiting on a `selector` or `text` when there is a reliable one to name.

**Put the customisation in the `hint`.** Anywhere the database departs from stock Odoo — a Sales action that allows creating a quote without an opportunity, a renamed build state, a delivery line the order refuses to confirm without — the tester needs to know before they hunt for a button that is not there. That is what `hint` is for, and it is the only field allowed to name buttons and menus.

## Test Scenario Validation

TestFlight Scenarios are validated against `olaunch_testflight/schemas/testflight_plan.v1.json`. This is the same schema that is validated OLaunch TestFlight Online Portal when published. 

Online Schema Validation
- `https://testflight.olaunch.com/api/v1/testflight/schemas/testflight_plan.v1.json` (no API key needed; `/api/v1/testflight/schemas` lists the versions)
- `POST /api/v1/testflight/schemas/validate` (API Key required) checks an uploaded test scenario for you)

```json
{
    "schema_version": 1,
    "uid": "my_scenario",
    "name": "My Scenario",
    "description": "One line on what the tester is doing.",
    "category": "sale",
    "tags": ["onboarding"],
    "allowed_groups": ["sales_team.group_sale_manager"],
    "required_modules": ["sale_management"],
    "steps": [ ... ]
}
```

**1. Local validation** (no database needed):

Use local json schema file or download from https://testflight.olaunch.com/api/v1/testflight/schemas/testflight_plan.v1.json
```
python3 <olaunch_testflight>/tools/validate_plan.py my_scenario.json    # or a directory
```

Checks the document shape against the schema, the uid matching the filename, unique step ids, and step references pointing backwards. Exit 0 = pass. Any `python3` runs it: it uses `jsonschema` when installed and a built-in checker otherwise (older copies of the tool need `pip install --user jsonschema`).

 TestFlight Scenario JSON documents can be validated Online at `https://testflight.olaunch.com/api/v1/testflight/schemas/validate` (API key required) to run the same validation that can be done locally.

**2. Schema validation does not check everything.** It does not check if a `res.model` exists, or the field name or type is correct, or if a `ext_id` resolves. These depend on the database not the json file. Those are checked at runtime by the verifier when the scenario is opened in the TestFlight panel, which reports:

- **Errors block the launch** — unknown model/field/xml id, a non-many2one condition field, a domain that will not compile, or no audience group existing there.
- **Warnings do not** — the step just will not tick itself.
- Some cross-key rules are runtime-only, not schema: `changed_fields` on a `trigger` other than `orm_update` passes local validation and is refused by the verifier.
- **Autoplay findings** (unknown model, xml id or domain inside `autoplay`) do neither: the scenario runs by hand as usual, only Play is withheld with the reason shown.

A scenario that passes the validation scheme check can still be refused on a given server. Expect to open it in the panel to run more detailed verification.

## Lint the wording (optional)

After writing or changing a scenario, offer to lint its wording on olaunch.com. `POST https://testflight.olaunch.com/api/v1/testflight/schemas/lint` needs an API key (see **Before you start: the API key**). It checks the text a tester reads against the rules in **Wording** above: AI filler, developer names, `Field = value`, and hints that narrate. It does not validate the document. Use `/schemas/validate` for that.

Pass a `vocabulary` block for each step, keyed by step id, with the buttons and fields of the screens that step touches as this database labels them. Read them from the form views (each `<button>`'s `name` and `string`, each field's name and label). With them, the linter answers `action_confirm` with "Confirm", and flags a button the hint names that is not in the list. Without them it still flags developer names, but cannot suggest the label.

```json
POST /api/v1/testflight/schemas/lint
{
  "document": {"schema_version": 1, "uid": "quote_to_order", "name": "Quote to order", "steps": [
    {"id": 3, "name": "Confirm the quote", "type": "wait_record", "type_wait_record": {"…": "…"},
     "hint": "Trigger action_confirm. The order is now locked and a delivery is created."}
  ]},
  "vocabulary": {
    "3": {"buttons": [{"name": "action_confirm", "string": "Confirm"}],
          "fields": [{"name": "partner_id", "string": "Customer"}]}
  }
}
```

```json
{"errors": 3, "warnings": 0, "findings": [
  {"path": "steps[0].hint", "severity": "error", "rule": "wording", "text": "Trigger",
   "message": "developer word; say what the tester presses"},
  {"path": "steps[0].hint", "severity": "error", "rule": "technical_name", "text": "action_confirm",
   "message": "Use the label the tester sees: \"Confirm\".", "suggestion": "Trigger Confirm."},
  {"path": "steps[0].hint", "severity": "error", "rule": "narration",
   "text": "The order is now locked and a delivery is created.",
   "message": "Says what the system does, not what the tester does. A hint gives the action and stops.",
   "suggestion": "Trigger Confirm."}
]}
```

`suggestion` is the whole field with every mechanical fix applied. Read it before using it: here it still says "Trigger", and the hint should read "Press Confirm." Fix every `error`. A `warn` is a judgement call: keep the text if it is right for this step.

## Testing a scenario end to end with auto play

Fly every scenario with an `autoplay` block end to end in a browser before handing it over. Agree this with the user before building (see **Before working with TestFlight Scenarios**), and offer it again after any change. Ask the user how to reach the Odoo it runs on (URL, database, a login in the scenario's `allowed_groups`) and which browser automation you can use; do not assume either. The database must have the scenario's module upgraded since the file last changed, or the panel lists the old version. Flying a scenario creates real records, so use a test database.

**Turn on debug logging first** (optional, but it is what makes a failure quick to diagnose). Set the system parameter `olaunch_testflight.debug_logging` to `True` (Settings > Technical > System Parameters), reload the page, and remove it when done. Then:

- **The browser console** echoes every auto play event as `[TestFlight autoplay] <event> {…}`, failures through `console.error`. Read the console while it plays.
- **The server log**, if you can read it, gets one INFO line for each step a request could have ticked: `OLaunch TestFlight: step 2 (…) completed by sale.order[42]` or `… not matched by sale.order[42]`.

The parameter needs olaunch_testflight 16.0.1.3.3, 17.0.1.3.3, 18.0.1.3.3, 19.0.1.2.3 or 20.0.1.2.3. On older builds, run `sessionStorage.olaunch_tf_debug = "1"` in the tab for the console echo (there is no server equivalent).

**Drive the panel through its automation hook, `odoo.__olaunch_testflight__`, not its buttons.** After logging in, open `/web` and wait for the hook to exist, then:

1. `open()`, `useLocalTests()`, and wait for `getState().toursLoaded`.
2. `selectTour(uid)` (returns `false` if no local scenario has that uid), then wait until `getState().planLoaded` is true and `autoplay.status` is no longer `idle` or `checking`. If `hasAutoplay` is false, `autoplayErrors` is not empty, or the status is `blocked`, Play is refused, and `autoplay.message` says why.
3. `setSpeed(100)` (no pauses), then `play({}, {manual: "stop", actionTimeoutMs: 20000})`. The first argument overrides autoplay vars. The options (`fromStep`, `untilStep`, `actionTimeoutMs`, `manual`) need `"play_options"` in the hook's `capabilities`.
4. Poll `getState()` every half second until `autoplay.status` is one of `done`, `manual_stop`, `reached`, `error`, `blocked` or `stopped`. `getState().log` is the diary of every event so far, and `getState().steps` shows which steps ticked.
5. `stopFlight()`, and give the request a moment to land before closing the browser.

`done` is a pass. `manual_stop` is a pass up to the first required step with no autoplay actions, and the steps from there on are not verified. Anything else is a failure. `autoplay.message` names the step, and the last `fail`, `odoo_error` or `tick_timeout` entry in the diary says what it was looking at (selector, matches, open dialog, error dialog, breadcrumb).

- **`fail`**: an action never found its element. Check the selector or label against the real screen.
- **`odoo_error`**: Odoo raised an error. The server traceback is in its log.
- **`tick_timeout`**: the actions ran but the step did not tick. With debug logging on, a `not matched by` line means the event happened and the step's domain or conditions rejected the record. No line at all means the event the step watches never happened (wrong trigger, model or method).

Fix the scenario, upgrade the module, and fly it again until it ends in `done`. Fly it once as a real tester login too, not only as admin, so that missing access rights show up.

An example runner for Playwright (Node) sits next to this file as `testflight_play.mjs`. Any tool that can log in, run JavaScript in the page, and read the console can do the same.

## Schema validation common issues and hints

- **An Odoo error dialog the step's own actions address is expected, not a failure.** A guarded save that raises an approval dialog (an over-budget drawdown) IS the journey: script the wait/click on its buttons and the player carries on; it only stops on an error dialog no action of the step targets.
- **Steps are not sequential — one event completes every step it matches.** The engine offers each event to *all* outstanding steps at once, so two steps watching the same thing both tick on the first occurrence. Two `button_start` steps for "start station 1" then "start station 2" both complete when the operator starts the first one. Give every step a distinct event (different model, method, trigger, or a `matched_record` narrowing that only one can satisfy), and put the repeated work in the `hint` of a step that watches something only the *end* of it produces. Screen steps are the exception: a `wait_window_action`, `wait_client_action` or `wait_route` step only ticks once every required step before it has ticked (current TestFlight clients), because a tester opens the same screen many times and the first visit would otherwise tick it early. A screen step therefore needs the tester to open its screen *after* the previous steps are done; one they are already on when the previous step ticks never ticks.
- **`target` only narrows on `matched_record`.** For `execute_kw`, `new_records` and `existing_records` are identical — the method call is the event, and the record it was called on is the match. For `orm_update` they do split create from write, which is a cheap way to make two steps on the same model distinct.
- **A step waiting on the tester's own request only sees the tester's own request.** A run lives in the browser session, so anything that arrives out of band — an incoming email, a cron, the upgrade service — happens with no run attached and can never tick a step. Start the scenario at the record that work produced.
- **Prefer watching the outcome over the method.** `execute_kw` only sees calls the *browser* makes. If a button opens a wizard, or an automation does the work, the real method runs server-side and is invisible — the step never ticks. A customised database may not even have the button you expect. It also reads badly: Preview the steps prints the raw method name for that step. Watching the result instead survives all of that:
  ```json
  {"res_model": "sale.order", "trigger": "orm_update", "target": "matched_record",
   "target_matched_record": {"step_id": 3}, "conditions": [], "domain": [["state", "=", "sale"]]}
  ```
- Do not assert a value the system already sets by default (e.g. a payment term new partners inherit) — the step passes instantly and proves nothing. Pick a value the tester must actively change.
- **Never put an autoplay value in a step's `domain`.** A domain is checked for every tester, and a person walking the scenario by hand picks their own product, their own quantity, their own price — `["price_unit", "=", 125]` matches only the number auto play happens to type, so the step sits there forever while the tester stares at a line they just added. Assert the *shape* of the outcome, not the figure: the line exists on the captured record (`conditions` + `product_id != false`), the quantity is `> 0`, the state moved. Where the point is that the tester *changed* a value, `changed_fields` with `matched_record` says exactly that and needs no domain at all.
- **Do not require a value the record already arrives with.** A field that pre-fills — the unit price copied from the product, the payment term off the customer — is not something the tester enters, so a step named "…and price the line" is asking for work the form already did. Watch the line being added and leave the figure out of both the name and the hint.
- `matched_record` narrows to the record an earlier step captured — use it for "confirm *that* quote".
- Adding an optional key does not need a `schema_version` bump; a breaking change does, plus a new `olaunch_testflight/schemas/testflight_plan.v<n>.json`.
- When a missing required field is detected (especially when it is discovered in a later step) and you need to go back to an earlier step to set the required field, this should be a step the user has to do earlier so they know which fields to fill out that will be needed later. The auto-play builder should not just sliently populate that field. We need to help the user understand the system and how to use it.
