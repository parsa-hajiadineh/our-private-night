# Parsa & Saba — Our Private Night

A mobile-first Persian invitation for 28 Aban 1405 / 19 November 2026.

## Preview

Requires Node.js. No dependency installation or build step is needed.

```sh
npm run dev
```

Open http://127.0.0.1:5173 and refresh after edits.

## Design

Original autumn-garden watercolor artwork, ivory paper, mocha, dusty pink and plum accents. Persian display typography uses Noto Nastaliq Urdu; body text uses Vazirmatn. Fonts and artwork are local assets with no runtime third-party requests.

- `index.html`: invitation copy, calendar, and event details.
- `style.css`: responsive layout, decorative motion, reduced-motion support.
- `app.js`: on-scroll reveals and a date-only countdown in Asia/Tehran.
- `assets/parsa-saba.ics`: all-day save-the-date. Update it when the event time is confirmed.
- `assets/garden-640.webp`, `garden-1024.webp`: original generated artwork at responsive sizes.
- `assets/floral-ribbon.webp`: original transparent botanical artwork.
- `assets/OFL.txt`, `Noto-OFL.txt`: font licenses.

## Content still needed

The couple's photograph, event time, and location. The current portrait frame contains a typographic monogram. There is no RSVP backend or collection of guest information yet.

The garden artwork is decorative; it does not represent a confirmed venue.
