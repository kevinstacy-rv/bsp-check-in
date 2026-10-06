# Event check-in

A staff check-in station for Renewed Vision events. Import attendees from a HubSpot contact segment, look someone up, and press **Print**. That checks them in, writes the check-in back to HubSpot, and prints a 3" × 1.5" name badge on a USB Zebra printer.

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
- **Badge**: drawn on a canvas in Plus Jakarta Sans with the ProPresenter lockup, then converted to a 1-bit ZPL graphic and sent through **Zebra Browser Print**. Long names shrink to fit, then wrap to two lines.

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

## Setting up the check-in computer

1. Install [Zebra Browser Print](https://www.zebra.com/us/en/support-downloads/printer-software/by-request-software.html) and keep it running.
2. Plug in the Zebra over USB. In Browser Print, make it the default printer.
3. Open the site in Chrome and sign in with the staff password.
4. On the **Setup** page, choose **Print a test badge**. Approve the prompts from Browser Print and Chrome ("allow this site to access devices on your local network").
5. If the badge prints sideways or off-centre:
   - Turn on **Rotate 90°** if your labels feed the 1.5" edge first.
   - Use the nudge fields to shift the badge (203 dpi = 203 dots per inch).
   - Switch to **300 dpi** if your printer is a 300 dpi model.
6. Import the segment while you're still online. After that the station can run offline.

**Use the system print dialog instead** prints the same badge through the normal print dialog. It's useful for checking the layout without Browser Print.

## Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests (ZPL encoding, search, HubSpot client, offline queue)
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
    label.ts             Badge layout → 1-bit bitmap
    zpl.ts               Bitmap → compressed ZPL
    zebra.ts             Zebra Browser Print client
public/
  brand/                 Logos from the Renewed Vision design system
  sw.js                  Offline caching
```
