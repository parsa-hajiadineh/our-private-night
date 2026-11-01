# Parsa & Saba — Our Private Night

Persian mobile invitation for 28 Aban 1405 / 19 November 2026.

## Run
Node.js 24+ is required for built-in SQLite.

    npm ci
    npm run dev
    npm test

Invitation: http://127.0.0.1:5173 — administration: http://127.0.0.1:5173/admin
The first start creates a private password in `.local/admin-password.txt`. The entire `.local` directory is ignored by Git and cannot be served through the website.

## Photo and music
Save your photograph as **assets/couple.jpg** and refresh. A portrait JPG around 1200 pixels wide is sufficient. Until it exists, the monogram remains visible.

`assets/wedding-piano.mp3` is an original synthesized 64-second instrumental preview, stored locally. Replace it with your chosen licensed MP3 under the same filename. Audio starts on the first guest interaction, has a pause button, and is not preloaded.

## Event
`event-config.json` contains the exact map pin, address and deadline. Admin settings override this file. RSVP closes Friday 15 Aban, **6 November 2026 23:59:59 Asia/Tehran**. Arrival is 17:00–17:45; the couple arrive at 18:00. The calendar ends at midnight on 20 November. Dress colors are optional.

## Guest content
RSVP responses are private and can be updated in the same browser before the deadline. Guestbook entries and uploads start pending. Only approved content is public. Media additionally requires the guest's permission to publish; private-only uploads cannot be published through admin.

Guests explicitly choose or capture files and press Send. Websites cannot automatically collect a phone gallery. Accepted formats: JPG, PNG, WebP, MP4, MOV, WebM. Limits: 80 MiB per file, ten files per batch, total storage default 2 GiB.

Admin supports moderation, RSVP CSV export, event settings and QR download.

## Hosting and QR
This is a Node application, not a static-only website. Hosting requires Node 24+, HTTPS and a persistent writable disk. Keep DATA_DIR persistent across deployments. Back up the whole data directory (database and uploads), preferably with the server stopped. Never commit it.

Set your real public HTTPS URL in admin or PUBLIC_BASE_URL. Then /api/qr.svg and the printable /qr.html card are available. QR opens the album directly. Localhost only works on your computer; it is not a guest-facing URL.

Environment variables: HOST (127.0.0.1), PORT (5173), DATA_DIR, ADMIN_PASSWORD, PUBLIC_BASE_URL, MAX_STORAGE_MB (2048). Configure them through your host. The app does not automatically load .env files. Use an HTTPS reverse proxy when hosting.

## Assets and tests
Original generated watercolor garden, botanical ribbon and veil texture. Local Vazirmatn and Noto Nastaliq fonts include OFL licenses. Decorative garden artwork does not depict the venue.

npm test uses isolated temporary databases and checks privacy, RSVP validation/deadline, moderation, consent, file validation, QR configuration, calendar timing and logout. Tests do not insert entries into your live database.
