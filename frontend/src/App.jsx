import { useCallback, useEffect, useState } from "react";
import { addSubscription, getSummary, listSubscriptions, setStatus } from "./api.js";
import { WALL, logoFor } from "./logos.js";

/*
  Backend contract (unchanged)
  POST  /subscriptions      { name, amount_minor, currency, billing_cycle, next_due_date,
                              category, status: "active", last_billed_date: "YYYY-MM-DD" | null }
  GET   /subscriptions      [ { id, name, amount_minor, currency, billing_cycle, next_due_date,
                                category, status, last_billed_date } ]
  PATCH /subscriptions/:id  { status: "active" | "paused" | "cancelled" }
  GET   /summary            { monthly_totals_minor: { USD: 4599 }, upcoming: [...] }

  "Archive" = status "cancelled". "Restart" = a fresh active subscription with a new last-paid date.
*/

const OTHER = "__other__";
const REMIND_DAYS = 7;

// Category first, then the app. Add more apps to any list and they appear in the dropdown.
const CATALOG = {
  "AI tools": ["Claude", "ChatGPT", "Perplexity", "Google Gemini", "Microsoft Copilot", "Grok", "Mistral Le Chat", "Poe", "Character.AI", "Runway", "ElevenLabs", "Suno", "Midjourney"],
  Music: ["Spotify", "Apple Music", "YouTube Music", "Amazon Music", "Tidal", "Deezer", "Audiomack", "Boomplay", "SoundCloud Go", "Pandora", "Qobuz", "Napster"],
  "Video & streaming": ["Netflix", "YouTube Premium", "Disney+", "Prime Video", "Showmax", "Apple TV+", "HBO Max", "Hulu", "Paramount+", "Peacock", "Twitch", "DStv", "StarTimes", "Crunchyroll", "Viu", "Mubi"],
  "Social media": ["X Premium", "LinkedIn Premium", "Snapchat+", "Telegram Premium", "Discord Nitro", "Meta Verified", "Reddit Premium", "Patreon", "Tinder", "Bumble"],
  "News & reading": ["Medium", "Substack", "Kindle Unlimited", "Audible", "The Economist", "New York Times", "Washington Post", "Financial Times", "Apple News+", "Scribd", "Blinkist"],
  "Design & art": ["Canva", "Figma", "Midjourney", "Adobe Creative Cloud", "Adobe Photoshop", "Adobe Illustrator", "Framer", "Sketch", "Envato Elements", "Freepik", "Shutterstock", "Dribbble Pro", "Spline"],
  "Photo & video editing": ["CapCut", "Adobe Lightroom", "Adobe Premiere Pro", "Picsart", "VSCO", "Descript", "Filmora", "Luminar", "Photoroom", "Remini", "InShot"],
  Productivity: ["Notion", "Microsoft 365", "Google Workspace", "Slack", "Zoom", "Todoist", "Evernote", "Trello", "Grammarly", "Asana", "ClickUp", "Airtable", "Miro", "Linear", "Calendly", "Obsidian Sync"],
  "Cloud & storage": ["Google One", "iCloud+", "Dropbox", "OneDrive", "pCloud", "Box", "Mega", "Proton Drive", "Backblaze", "Sync.com"],
  "Developer tools": ["Cursor", "GitHub", "GitHub Copilot", "JetBrains", "Vercel", "Replit", "Netlify", "Heroku", "DigitalOcean", "AWS", "Google Cloud", "Cloudflare", "Supabase", "Postman", "Docker", "Sentry", "ngrok", "Domain name", "Web hosting"],
  "Education & learning": ["Duolingo", "Coursera", "Udemy", "Skillshare", "MasterClass", "LinkedIn Learning", "Brilliant", "Babbel", "Rosetta Stone", "Memrise", "Codecademy", "DataCamp", "Pluralsight", "edX", "Chegg", "Quizlet Plus"],
  Gaming: ["Xbox Game Pass", "PlayStation Plus", "Nintendo Switch Online", "EA Play", "Roblox Premium", "Ubisoft+", "Apple Arcade", "Google Play Pass", "GeForce Now", "Fortnite Crew", "World of Warcraft", "Minecraft Realms"],
  "Health & fitness": ["Gym membership", "Strava", "Headspace", "Calm", "MyFitnessPal", "Fitbit Premium", "Peloton", "Apple Fitness+", "Noom", "Whoop", "Oura", "Flo Premium", "Health insurance"],
  "Finance & investing": ["Bank account fee", "Credit card annual fee", "Revolut", "TradingView", "Robinhood Gold", "YNAB", "Quicken", "Seeking Alpha", "Morningstar", "Insurance premium", "Chama contribution"],
  "Internet & phone": ["Wi-Fi", "Safaricom", "Safaricom Home Fibre", "Airtel", "Telkom", "Zuku", "Faiba", "Starlink", "Mobile data bundle", "Verizon", "AT&T", "T-Mobile", "Vodafone", "Google Fi", "Mint Mobile"],
  "Security & VPN": ["NordVPN", "ExpressVPN", "Proton VPN", "Surfshark", "Mullvad", "Private Internet Access", "1Password", "Bitwarden", "Dashlane", "LastPass", "Norton", "McAfee", "Kaspersky", "Bitdefender", "Malwarebytes", "Aura"],
  "Shopping & memberships": ["Amazon Prime", "Uber One", "Walmart+", "Costco", "Instacart+", "DoorDash DashPass", "Glovo Prime", "Shopify", "Store loyalty membership"],
  Other: [],
};
const CATEGORIES = Object.keys(CATALOG);

const HUES = {
  "x premium": 205, spotify: 145, medium: 40, claude: 18, chatgpt: 165, perplexity: 190,
  cursor: 260, midjourney: 290, canva: 230, figma: 330, notion: 60, "youtube premium": 5, "wi-fi": 100,
  netflix: 355,
};

const CURRENCIES = ["USD", "EUR", "GBP", "KES"];

// The backend understands these four billing cycles.
const CYCLES = [
  { value: "weekly", label: "Every week" },
  { value: "monthly", label: "Every month" },
  { value: "quarterly", label: "Every 3 months" },
  { value: "yearly", label: "Every year" },
];
const CYCLE_LABEL = { weekly: "Weekly", monthly: "Monthly", quarterly: "Every 3 months", yearly: "Yearly" };
const STEP_MONTHS = { monthly: 1, quarterly: 3, yearly: 12 };

const todayUtc = () => new Date().toISOString().slice(0, 10);
const asDate = (iso) => new Date(`${iso}T00:00:00Z`);
const daysUntil = (iso) => Math.round((asDate(iso) - asDate(todayUtc())) / 864e5);
const dateText = (iso) => asDate(iso).toLocaleDateString("en", { day: "numeric", month: "short", timeZone: "UTC" });
const dateLong = (iso) =>
  asDate(iso).toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function addDays(iso, n) {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Month-end safe: Jan 31 + 1 month = Feb 28, and counting from the original date keeps Mar 31 at Mar 31.
function addMonths(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const total = m - 1 + n;
  const year = y + Math.floor(total / 12);
  const month = total % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

// Next payment = last paid date + one billing period, moved forward until it is today or later.
function computeNextDue(lastPaid, cycle) {
  if (!lastPaid) return "";
  const today = todayUtc();
  const stepFrom = (k) => (cycle === "weekly" ? addDays(lastPaid, 7 * k) : addMonths(lastPaid, STEP_MONTHS[cycle] * k));
  let k = 1;
  let next = stepFrom(k);
  while (next < today) next = stepFrom(++k);
  return next;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function hueFor(name) {
  const known = HUES[name.trim().toLowerCase()];
  if (known !== undefined) return known;
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const decimals = (c) => new Intl.NumberFormat("en", { style: "currency", currency: c }).resolvedOptions().maximumFractionDigits;
const formatMoney = (minor, c) => new Intl.NumberFormat("en", { style: "currency", currency: c }).format(minor / 10 ** decimals(c));
const toMinor = (text, c) => Math.round(parseFloat(text) * 10 ** decimals(c));
const minorToText = (minor, c) => (minor / 10 ** decimals(c)).toFixed(decimals(c));

function dueLabel(d) {
  if (d === 0) return "Due today";
  if (d === 1) return "Due tomorrow";
  if (d < 0) return `${Math.abs(d)} days overdue`;
  return `Due in ${d} days`;
}

const sameApp = (s) => `${s.name.trim().toLowerCase()}|${s.category}`;

function Logo({ icon }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d={icon.path} />
    </svg>
  );
}

function Tick() {
  return (
    <svg className="tick" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M7.5 12.5l3 3 6-6.5" />
    </svg>
  );
}

function Mark({ name }) {
  const icon = logoFor(name);
  return (
    <span className="mark" style={{ "--h": hueFor(name || "?") }} aria-hidden="true">
      {icon ? <Logo icon={icon} /> : (name || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function DateTile({ iso }) {
  const d = asDate(iso);
  return (
    <span className="date-tile" aria-hidden="true">
      <span>{d.toLocaleDateString("en", { month: "short", timeZone: "UTC" })}</span>
      <strong>{d.getUTCDate()}</strong>
    </span>
  );
}

// Decorative wall of app logos behind the page.
function LogoWall() {
  const tiles = Array.from({ length: 96 }, (_, i) => WALL[(i * 5) % WALL.length]);
  return (
    <div className="wall" aria-hidden="true">
      {tiles.map((icon, i) => (
        <span key={i} className="wall-tile">
          {icon && <Logo icon={icon} />}
        </span>
      ))}
    </div>
  );
}

function buildReminders(subs) {
  const out = [];
  subs.forEach((s) => {
    if (s.status !== "active") return;
    const d = daysUntil(s.next_due_date);
    const money = formatMoney(s.amount_minor, s.currency);
    if (d >= 0 && d <= REMIND_DAYS) {
      const text =
        d === 0
          ? `${s.name} is due today. Pay ${money} now, or archive it if you no longer need it.`
          : d === 1
            ? `${s.name} is due tomorrow (${dateText(s.next_due_date)}). Get ${money} ready.`
            : `${s.name} is due in ${d} days (${dateText(s.next_due_date)}). Get ${money} ready to pay.`;
      out.push({ key: `r${s.id}`, tone: d <= 3 ? "alert" : "heads", text });
    }
    if (s.last_billed_date) {
      const ago = -daysUntil(s.last_billed_date);
      if (ago >= 0 && ago <= 7)
        out.push({ key: `b${s.id}`, tone: "ok", text: `You paid ${s.name} on ${dateText(s.last_billed_date)} (${money}).` });
    }
  });
  return out;
}

const emptyForm = () => ({
  category: "",
  app: "",
  customName: "",
  amount: "",
  currency: "USD",
  billing_cycle: "monthly",
  last_paid: todayUtc(),
});

export default function App() {
  const [summary, setSummary] = useState(null);
  const [subs, setSubs] = useState([]);
  const [loadState, setLoadState] = useState("loading");
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const [notice, setNotice] = useState("");
  const [listError, setListError] = useState("");
  const [restartId, setRestartId] = useState(null);
  const [restart, setRestart] = useState({ last_paid: todayUtc(), cycle: "monthly", amount: "" });
  const [restarting, setRestarting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoadState((s) => (s === "ready" ? s : "loading"));
    try {
      const [sum, list] = await Promise.all([getSummary(), listSubscriptions()]);
      setSummary(sum);
      setSubs(list);
      setLoadError("");
      setLoadState("ready");
    } catch (err) {
      setLoadError(err.message);
      setLoadState("error");
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // The success messages fade away by themselves after a few seconds.
  useEffect(() => {
    if (!justAdded) return undefined;
    const t = setTimeout(() => setJustAdded(false), 4000);
    return () => clearTimeout(t);
  }, [justAdded]);
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const clearError = (field) => setFieldErrors((errs) => ({ ...errs, [field]: undefined }));

  const update = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    clearError(field);
  };

  const onCategory = (e) => {
    const category = e.target.value;
    setForm((f) => ({ ...f, category, app: "", customName: "" }));
    clearError("category");
    clearError("app");
    clearError("customName");
  };

  const appOptions = CATALOG[form.category] ?? [];
  const typingOwnName = form.category === "Other" || form.app === OTHER;
  const finalName = typingOwnName ? form.customName.trim() : form.app;
  const nextDue = computeNextDue(form.last_paid, form.billing_cycle);

  function validate() {
    const errs = {};
    if (!form.category) errs.category = "Choose a category first.";
    else if (!finalName) errs[typingOwnName ? "customName" : "app"] = typingOwnName ? "Type the app name." : "Choose an app.";
    const amount = parseFloat(form.amount);
    if (!Number.isFinite(amount) || amount <= 0) errs.amount = "Enter an amount above 0.";
    if (!form.last_paid || Number.isNaN(Date.parse(form.last_paid))) errs.last_paid = "Pick the date you last paid.";
    else if (form.last_paid > todayUtc()) errs.last_paid = "Last paid can't be in the future.";
    return errs;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setSubmitError("");
    setJustAdded(false);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setSubmitting(true);
    try {
      await addSubscription({
        name: finalName,
        amount_minor: toMinor(form.amount, form.currency),
        currency: form.currency,
        billing_cycle: form.billing_cycle,
        next_due_date: nextDue,
        category: form.category,
        status: "active",
        last_billed_date: form.last_paid,
      });
      setJustAdded(true);
      setForm((f) => ({ ...emptyForm(), currency: f.currency }));
      await loadAll();
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function archive(s) {
    if (!window.confirm(`Archive ${s.name}? Billing and reminders stop. You can restart it any time from the Archived list.`)) return;
    setListError("");
    try {
      await setStatus(s.id, "cancelled");
      setNotice(`${s.name} archived`);
      await loadAll();
    } catch (err) {
      setListError(err.message);
    }
  }

  function openRestart(s) {
    setListError("");
    setRestartId(s.id);
    setRestart({ last_paid: todayUtc(), cycle: s.billing_cycle, amount: minorToText(s.amount_minor, s.currency) });
  }

  async function confirmRestart(s) {
    setListError("");
    const amount = parseFloat(restart.amount);
    if (!Number.isFinite(amount) || amount <= 0) return setListError("Enter an amount above 0.");
    if (!restart.last_paid || restart.last_paid > todayUtc()) return setListError("Pick the date you last paid (not in the future).");
    setRestarting(true);
    try {
      await addSubscription({
        name: s.name,
        amount_minor: toMinor(restart.amount, s.currency),
        currency: s.currency,
        billing_cycle: restart.cycle,
        next_due_date: computeNextDue(restart.last_paid, restart.cycle),
        category: s.category,
        status: "active",
        last_billed_date: restart.last_paid,
      });
      setRestartId(null);
      setNotice(`${s.name} restarted successfully`);
      await loadAll();
    } catch (err) {
      setListError(err.message);
    } finally {
      setRestarting(false);
    }
  }

  const totals = summary ? Object.entries(summary.monthly_totals_minor) : [];
  const reminders = buildReminders(subs);
  const active = subs
    .filter((s) => s.status === "active")
    .sort((a, b) => a.next_due_date.localeCompare(b.next_due_date) || a.name.localeCompare(b.name));

  // Archived = stopped subscriptions, one per app, hiding any app that is active again.
  const activeKeys = new Set(active.map(sameApp));
  const latestStopped = new Map();
  subs
    .filter((s) => s.status !== "active" && !activeKeys.has(sameApp(s)))
    .forEach((s) => {
      const k = sameApp(s);
      const cur = latestStopped.get(k);
      if (!cur || (s.last_billed_date || "") >= (cur.last_billed_date || "")) latestStopped.set(k, s);
    });
  const archived = [...latestStopped.values()];

  const restartDue = restartId !== null ? computeNextDue(restart.last_paid, restart.cycle) : "";

  return (
    <>
      <LogoWall />
      <div className="page">
        <header className="masthead">
          <p className="hello">Hi there, {greeting().toLowerCase()}.</p>
          <h1>Renewals</h1>
          <p className="lede">
            Let's track your stuff. Add the apps, AI tools, music, art and design subscriptions you pay for, and
            Renewals shows what you spend each month, reminds you 7 days before something is due, and keeps archived
            the ones you stopped, ready to restart.
          </p>
        </header>

        <main className="layout">
          <section className="panel" aria-labelledby="add-heading">
            <h2 id="add-heading">Add a subscription</h2>
            <form className="add-form" onSubmit={onSubmit} noValidate>
              {/* Step 1: category first, then the app */}
              <div className="group">
                <h3 className="group-title"><span className="step">1</span> What are you paying for?</h3>

                <div className="field">
                  <label htmlFor="category">Category</label>
                  <select id="category" value={form.category} onChange={onCategory} aria-invalid={!!fieldErrors.category}>
                    <option value="">Choose a category…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {fieldErrors.category && <p className="field-error">{fieldErrors.category}</p>}
                </div>

                {form.category === "Other" ? null : (
                  <div className="field">
                    <label htmlFor="app">App</label>
                    <select id="app" value={form.app} onChange={update("app")} disabled={!form.category} aria-invalid={!!fieldErrors.app}>
                      <option value="">{form.category ? "Choose an app…" : "Choose a category first"}</option>
                      {appOptions.map((a) => <option key={a} value={a}>{a}</option>)}
                      {form.category && <option value={OTHER}>Other (type your own)…</option>}
                    </select>
                    {fieldErrors.app && <p className="field-error">{fieldErrors.app}</p>}
                  </div>
                )}

                {form.category && typingOwnName && (
                  <div className="field">
                    <label htmlFor="customName">App name</label>
                    <input id="customName" value={form.customName} onChange={update("customName")} placeholder="Type the app or service name" aria-invalid={!!fieldErrors.customName} />
                    {fieldErrors.customName && <p className="field-error">{fieldErrors.customName}</p>}
                  </div>
                )}
              </div>

              {/* Step 2: cost */}
              <div className="group">
                <h3 className="group-title"><span className="step">2</span> How much do you pay?</h3>
                <div className="row">
                  <div className="field grow">
                    <label htmlFor="amount">Amount</label>
                    <input id="amount" type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={update("amount")} aria-invalid={!!fieldErrors.amount} />
                    {fieldErrors.amount && <p className="field-error">{fieldErrors.amount}</p>}
                  </div>
                  <div className="field">
                    <label htmlFor="currency">Currency</label>
                    <select id="currency" value={form.currency} onChange={update("currency")}>
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Step 3: last paid + how often; the next payment date is calculated */}
              <div className="group">
                <h3 className="group-title"><span className="step">3</span> When do you pay?</h3>
                <div className="row">
                  <div className="field grow">
                    <label htmlFor="paid">Last paid on</label>
                    <input id="paid" type="date" max={todayUtc()} value={form.last_paid} onChange={update("last_paid")} aria-invalid={!!fieldErrors.last_paid} />
                    {fieldErrors.last_paid && <p className="field-error">{fieldErrors.last_paid}</p>}
                  </div>
                  <div className="field grow">
                    <label htmlFor="cycle">Pay again</label>
                    <select id="cycle" value={form.billing_cycle} onChange={update("billing_cycle")}>
                      {CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>
                {nextDue && (
                  <p className="next-pay">
                    Next payment: <strong>{dateLong(nextDue)}</strong>
                    <span className="muted"> · {dueLabel(daysUntil(nextDue)).toLowerCase()}</span>
                  </p>
                )}
              </div>

              <button className="primary" type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save subscription"}</button>
              <div aria-live="polite">
                {submitError && <p className="banner banner-error">{submitError}</p>}
                {justAdded && (
                  <p className="banner banner-ok" role="status">
                    <Tick />
                    Added successfully
                  </p>
                )}
              </div>
            </form>
          </section>

          <div className="stack">
            <section className="panel hero" aria-labelledby="total-heading">
              <h2 id="total-heading">Monthly cost</h2>
              {loadState === "loading" && <p className="muted">Loading your totals…</p>}
              {loadState === "error" && (
                <div className="banner banner-error">
                  <p>Could not load your data: {loadError}</p>
                  <button className="link" onClick={loadAll}>Try again</button>
                </div>
              )}
              {loadState === "ready" && totals.length === 0 && <p className="muted">Nothing tracked yet. Choose a category on the left and add its price.</p>}
              {totals.length > 0 && (
                <ul className="totals">
                  {totals.map(([c, minor]) => (
                    <li key={c}><span className="big">{formatMoney(minor, c)}</span><span className="muted">per month in {c}</span></li>
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" aria-labelledby="remind-heading">
              <h2 id="remind-heading">Reminders</h2>
              {loadState === "ready" && reminders.length === 0 && <p className="muted">All quiet. Nothing is due in the next 7 days.</p>}
              <ul className="reminders">
                {reminders.map((r) => <li key={r.key} className={r.tone}>{r.text}</li>)}
              </ul>
            </section>

            <section className="panel" aria-labelledby="apps-heading">
              <h2 id="apps-heading">Apps you're subscribed to</h2>
              <div aria-live="polite">
                {notice && (
                  <p className="banner banner-ok" role="status">
                    <Tick />
                    {notice}
                  </p>
                )}
                {listError && <p className="banner banner-error">{listError}</p>}
              </div>
              {loadState === "ready" && active.length === 0 && <p className="muted">No active subscriptions yet. Add one on the left.</p>}
              <ul className="renewals">
                {active.map((s) => {
                  const d = daysUntil(s.next_due_date);
                  return (
                    <li key={s.id} className={d <= 3 ? "soon" : d <= REMIND_DAYS ? "near" : ""}>
                      <DateTile iso={s.next_due_date} />
                      <Mark name={s.name} />
                      <div className="grow">
                        <strong>{s.name}</strong>
                        <span className="muted">{dueLabel(d)} · {CYCLE_LABEL[s.billing_cycle] ?? s.billing_cycle}</span>
                      </div>
                      <span className="amount">{formatMoney(s.amount_minor, s.currency)}</span>
                      <span className="actions">
                        <button className="link" onClick={() => archive(s)}>Archive</button>
                      </span>
                    </li>
                  );
                })}
              </ul>

              {archived.length > 0 && (
                <>
                  <h3 className="sub-heading">Archived (billing stopped)</h3>
                  <ul className="subs">
                    {archived.map((s) => (
                      <li key={s.id} className="stopped">
                        <Mark name={s.name} />
                        <div className="grow">
                          <strong>{s.name}</strong>
                          <span className="muted">
                            {formatMoney(s.amount_minor, s.currency)} · {CYCLE_LABEL[s.billing_cycle] ?? s.billing_cycle} · {s.last_billed_date ? `last paid ${dateText(s.last_billed_date)}` : "never paid"}
                          </span>
                        </div>
                        {restartId === s.id ? (
                          <span className="actions">
                            <button className="link" onClick={() => setRestartId(null)}>Close</button>
                          </span>
                        ) : (
                          <span className="actions">
                            <button className="link" onClick={() => openRestart(s)}>Restart</button>
                          </span>
                        )}

                        {restartId === s.id && (
                          <div className="restart">
                            <p className="muted restart-note">Reset the dates to continue paying {s.name}.</p>
                            <div className="row">
                              <div className="field grow">
                                <label htmlFor={`rs-paid-${s.id}`}>Last paid on</label>
                                <input id={`rs-paid-${s.id}`} type="date" max={todayUtc()} value={restart.last_paid} onChange={(e) => setRestart((r) => ({ ...r, last_paid: e.target.value }))} />
                              </div>
                              <div className="field grow">
                                <label htmlFor={`rs-cycle-${s.id}`}>Pay again</label>
                                <select id={`rs-cycle-${s.id}`} value={restart.cycle} onChange={(e) => setRestart((r) => ({ ...r, cycle: e.target.value }))}>
                                  {CYCLES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                                </select>
                              </div>
                            </div>
                            <div className="field">
                              <label htmlFor={`rs-amt-${s.id}`}>Amount ({s.currency})</label>
                              <input id={`rs-amt-${s.id}`} type="number" inputMode="decimal" min="0" step="0.01" value={restart.amount} onChange={(e) => setRestart((r) => ({ ...r, amount: e.target.value }))} />
                            </div>
                            {restartDue && (
                              <p className="next-pay">
                                Next payment: <strong>{dateLong(restartDue)}</strong>
                                <span className="muted"> · {dueLabel(daysUntil(restartDue)).toLowerCase()}</span>
                              </p>
                            )}
                            <div className="restart-actions">
                              <button className="primary" type="button" disabled={restarting} onClick={() => confirmRestart(s)}>
                                {restarting ? "Restarting…" : "Restart billing"}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          </div>
        </main>
      </div>
    </>
  );
}
