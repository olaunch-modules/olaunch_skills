// Auto-play one TestFlight scenario and report where it stopped.
// ODOO_URL=https://… ODOO_DB=… ODOO_LOGIN=… ODOO_PASSWORD=… node testflight_play.mjs <scenario_uid>
import { chromium } from 'playwright';

const { ODOO_URL: base, ODOO_DB: db = '', ODOO_LOGIN: login, ODOO_PASSWORD: password } = process.env;
const uid = process.argv[2];
const TERMINAL = ['done', 'manual_stop', 'reached', 'error', 'blocked', 'stopped'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', (m) => console.log(`[console.${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

await page.goto(`${base}/web/login${db ? `?db=${encodeURIComponent(db)}` : ''}`);
await page.fill('input[name="login"]', login);
await page.fill('input[name="password"]', password);
await page.press('input[name="password"]', 'Enter');
await page.waitForURL((url) => !url.pathname.startsWith('/web/login'));
await page.goto(`${base}/web`);
await page.waitForFunction(() => window.odoo && odoo.__olaunch_testflight__, null, { timeout: 60000 });

const tf = (fn, ...args) => page.evaluate(([f, a]) => odoo.__olaunch_testflight__[f](...a), [fn, args]);
const state = () => tf('getState');
const until = async (test, ms = 30000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(500)) {
    const st = await state();
    if (test(st)) return st;
  }
  throw new Error('timed out waiting for the TestFlight panel');
};

await tf('open');
await tf('useLocalTests');
await until((st) => st.toursLoaded);
if (!(await tf('selectTour', uid))) throw new Error(`no local scenario ${uid}`);
let st = await until((st) => st.planLoaded && !['idle', 'checking'].includes(st.autoplay.status));
if (!st.hasAutoplay || st.autoplay.status === 'blocked' || st.autoplayErrors?.length) {
  throw new Error(`cannot play: ${st.autoplay.message || JSON.stringify(st.autoplayErrors)}`);
}
await tf('setSpeed', 100);
await tf('play', {}, { manual: 'stop', actionTimeoutMs: 20000 });

let seen = 0;
st = await until((st) => {
  st.log.slice(seen).forEach((e) => console.log(`[diary] ${JSON.stringify(e)}`));
  seen = st.log.length;
  return TERMINAL.includes(st.autoplay.status);
}, 15 * 60000);

const { status, message, stepId } = st.autoplay;
console.log(`RESULT ${status} at step ${stepId ?? '-'}: ${message || ''}`);
console.log(st.steps.map((s) => `  ${s.completed ? '✓' : '·'} ${s.id} ${s.name}${s.hasAutoplay ? '' : ' (manual)'}`).join('\n'));
if (!['done', 'manual_stop', 'reached'].includes(status)) await page.screenshot({ path: 'testflight-failure.png' });
await tf('stopFlight');
await sleep(2000); // let the stop request land before the session goes away
await browser.close();
process.exit(['done', 'manual_stop', 'reached'].includes(status) ? 0 : 1);
