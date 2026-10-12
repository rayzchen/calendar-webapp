import ICAL from "ical.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Warm-instance cache of raw feeds (5 min). The CDN also caches responses (see header below).
const feeds = new Map();
const TTL = 5 * 60e3;

async function getFeed(url, force) {
  const hit = feeds.get(url);
  if (!force && hit && Date.now() - hit.t < TTL) return hit.text;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const text = await r.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("Not an iCalendar feed");
  feeds.set(url, { t: Date.now(), text });
  return text;
}

function expand(ics, cid, rs, re) {
  ICAL.TimezoneService.reset();
  const root = new ICAL.Component(ICAL.parse(ics));
  root.getAllSubcomponents("vtimezone").forEach(z => ICAL.TimezoneService.register(z));

  const out = [];
  const add = (uid, key, ev, s, e) => {
    const allDay = s.isDate;
    const sd = s.toJSDate(), ed = e.toJSDate();
    if (ed <= rs || sd >= re) return;
    out.push({
      id: `${cid}:${uid}:${key}`, c: cid,
      title: String(ev.summary || "(No title)").slice(0, 300),
      start: allDay ? s.toString() : sd.toISOString(),
      end: allDay ? e.toString() : ed.toISOString(),
      allDay, location: String(ev.location || "").slice(0, 300),
    });
  };

  const exceptions = new Map(), bases = [];
  for (const c of root.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(c);
    if (ev.isRecurrenceException()) {
      const rid = c.getFirstPropertyValue("recurrence-id");
      if (rid) exceptions.set(`${ev.uid}|${rid.toUnixTime()}`, ev);
    } else bases.push(ev);
  }
  for (const ev of bases) {
    if (ev.component.getFirstPropertyValue("status") === "CANCELLED") continue;
    if (ev.isRecurring()) {
      const it = ev.iterator();
      let o, n = 0;
      while ((o = it.next()) && n++ < 5000) {
        if (o.toJSDate() >= re) break;
        const x = exceptions.get(`${ev.uid}|${o.toUnixTime()}`);
        if (x) {
          if (x.component.getFirstPropertyValue("status") !== "CANCELLED") add(ev.uid, o.toUnixTime(), x, x.startDate, x.endDate);
          continue;
        }
        const e = o.clone();
        e.addDuration(ev.duration);
        add(ev.uid, o.toUnixTime(), ev, o, e);
      }
    } else add(ev.uid, "1", ev, ev.startDate, ev.endDate);
  }
  return out;
}

export default async function handler(req, res) {
  const { start, end, refresh } = req.query;
  const rs = new Date(start), re = new Date(end);
  if (isNaN(rs) || isNaN(re) || re <= rs || re - rs > 120 * 864e5)
    return res.status(400).json({ error: "Invalid start/end range (max 120 days)" });

  const cfg = JSON.parse(await readFile(join(process.cwd(), "calendars.json"), "utf8"));
  const results = await Promise.all(cfg.map(async (c, i) => {
    const meta = { id: `c${i}`, name: c.name, color: c.color }; // feed URL is never sent to the browser
    try { return { meta, events: expand(await getFeed(c.url, !!refresh), meta.id, rs, re) }; }
    catch (e) { return { meta: { ...meta, error: e.message }, events: [] }; }
  }));

  res.setHeader("Cache-Control", refresh ? "no-store" : "public, s-maxage=300, stale-while-revalidate=600");
  res.status(200).json({ calendars: results.map(r => r.meta), events: results.flatMap(r => r.events) });
}
