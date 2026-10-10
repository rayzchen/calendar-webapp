# Static calendar viewer

This is a static-only version: no Node.js, build step, API route, or backend. Upload `index.html` and `calendars.json` to the same directory on your static host.

## Configure

Edit `calendars.json` before publishing:

```json
[
  { "name": "Calendar 1", "url": "https://example.com/calendar1.ics", "color": "#4F7CFF" },
  { "name": "Calendar 2", "url": "https://example.com/calendar2.ics", "color": "#10A37F" },
  { "name": "Calendar 3", "url": "https://example.com/calendar3.ics", "color": "#E39B35" },
  { "name": "Calendar 4", "url": "https://example.com/calendar4.ics", "color": "#B06BE0" }
]
```

## Important limitations

- **CORS:** The browser fetches each ICS URL directly. The calendar provider must allow cross-origin browser requests. Google Calendar's private `basic.ics` feeds generally do not provide the CORS headers needed for this, so this version may show a CORS error for those feeds. Static hosting cannot add a server-side proxy.
- **Privacy:** `calendars.json` is public on your static site, and feed URLs are secrets that can grant access to calendar details. Do not publish private iCal URLs in this file. Rotate any feed URLs that have been exposed.
- FullCalendar and ical.js are loaded from public CDNs, so visitors need internet access.

If the Google feeds fail due to CORS, the reliable options are a small server-side proxy or a static build of pre-fetched ICS data (which will not update automatically unless rebuilt).
