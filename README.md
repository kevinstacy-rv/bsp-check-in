# Event check-in

A staff check-in station for Renewed Vision events. Import attendees from a HubSpot contact segment, look someone up, and press **Print**. That checks them in, writes the check-in back to HubSpot, and prints a name badge on a USB Brother QL-800 label printer.

Built with Next.js and deployed on Vercel. The design follows the Renewed Vision design system (ProPresenter theme).

## How it works

- **Setup** (`/setup`): name the event, pick a HubSpot contact segment and import it. The app reads first name, last name and organization. Organization is the contact's `company` field, or its associated company's name when that field is blank.
- **Check-in** (`/`): type to search by name, organization or email, then press **Print** (or **Enter**). The attendee is checked in first and the badge prints second, so a printer problem never loses a check-in. You can **Reprint** a badge or **Undo** a check-in.
- **Walk-ins**: **Add walk-in** creates the contact in HubSpot (or updates the existing contact if the email matches), checks them in and prints. If the segment is static, they're added to it as well.
- **HubSpot write-back**: each check-in sets two contact properties:
  - `event_check_in_name`, the event name from setup
  - `event_check_in_at`, the check-in time

  Both are created automatically the first time you import. You can rename them with environment variables (see below).
- **Offline**: the roster and every check-in are saved in the browser. While Wi-Fi is down, check-ins queue and printing keeps working, because the printer is local. The queue syncs to HubSpot when the connection returns. The header shows sync and printer status.
- **Badge**: drawn on a canvas at 300 dpi in Plus Jakarta Sans with the ProPresenter lockup, then printed through the Mac's Brother driver on a page sized exactly to the label roll. With Chrome's kiosk printing turned on, it prints without a dialog. Long names shrink to fit, then wrap to two lines.

## Deploy to Vercel

1. Import this repo in Vercel (framework preset: Next.js).
2. Add these environment variables:

   | Variable | Value |
   |---|---|
   | `HUBSPOT_TOKEN` | Private app access token |
   | `STAFF_PASSWORD` | Password staff type at the station |
   | `SESSION_SECRET` | Long random string (`openssl rand -base64 32`) |
   | `HUBSPOT_CHECKIN_EVENT_PROPERTY` | Optional. Defaults to `event_check_in_name` |
   | `HUBSPOT_CHECKIN_TIME_PROPERTY` | Optional. Defaults to `event_check_in_at` |

3. The HubSpot private app needs these scopes:
   - `crm.lists.read` and `crm.lists.write`
   - `crm.objects.contacts.read` and `crm.objects.contacts.write`
   - `crm.objects.companies.read`
   - `crm.schemas.contacts.read` and `crm.schemas.contacts.write` (to create the two properties)

## Setting up the check-in Mac

1. Install the **Brother QL-800 driver for macOS** from [support.brother.com](https://support.brother.com). Plug the printer in over USB, add it in **System Settings → Printers & Scanners**, and make it the default printer.
2. **Turn off Editor Lite**: hold the Editor Lite button on the printer until its green light goes out. While Editor Lite is on, the QL-800 appears as a USB drive instead of a printer.
3. Load the label roll and pick the matching **Label roll** on the Setup page. The default is DK-1202 (100 × 62 mm).
4. Open the check-in window with kiosk printing, so **Print** goes straight to the printer with no dialog. Run this in Terminal, replacing the URL with your Vercel address:

   ```bash
   open -na "Google Chrome" --args --kiosk-printing \
     --user-data-dir="$HOME/Library/Application Support/CheckInChrome" \
     https://your-check-in-site.vercel.app
   ```

   This uses a separate Chrome profile, so kiosk printing doesn't affect your everyday browsing. The Setup page shows the same command with your address already filled in, plus a Copy button.
5. In that window, sign in and choose **Print a test badge** on the Setup page.
6. If the badge comes out shrunk, cut off or on the wrong paper size:
   - Run the same command **without** `--kiosk-printing`.
   - Print a test badge from the dialog, choosing the QL-800, the paper size that matches your roll (e.g. 62 mm × 100 mm), margins **None** and scale **100%**.
   - Relaunch with `--kiosk-printing`. Chrome remembers those print settings for that profile.
   - Use the nudge fields on the Setup page for small shifts.
7. Import the segment while you're still online. After that the station can run offline.

## Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests (search, HubSpot client, offline queue)
npm run typecheck
```

The service worker (offline page loads) is only registered in production builds (`npm run build && npm start`).

## Project layout

```
src/
  proxy.ts               Staff password gate (signed cookie)
  app/
    page.tsx             Check-in screen
    setup/page.tsx       Event, segment import, printer and badge preview
    login/page.tsx
    api/hubspot/…        Segment search/import, check-in, walk-ins (server-only token)
  components/            UI
  lib/
    hubspot.ts           HubSpot API client (server)
    store.ts             Local state + offline outbox (browser)
    sync.ts              Delivers the outbox to HubSpot
    label.ts             Badge layout → black-and-white image at label size
    print.ts             Prints the badge through the system printer driver
public/
  brand/                 Logos from the Renewed Vision design system
  sw.js                  Offline caching
```
