# Event check-in

A staff check-in station for Renewed Vision events. Import attendees from a HubSpot contact segment, look someone up, and press **Print**. That checks them in, writes the check-in back to HubSpot, and prints a name badge on a USB Brother QL-800 label printer.

Built with Next.js and deployed on Vercel. The design follows the Renewed Vision design system (ProPresenter theme).

## How it works

- **Setup** (`/setup`): name the event, pick a HubSpot contact segment and import it. The app reads first name, last name and organization. Organization is the contact's `company` field, or its associated company's name when that field is blank.
- **Check-in** (`/`): type to search by name, organization or email, then press **Print** (or **Enter**). The attendee is checked in first and the badge prints second, so a printer problem never loses a check-in. You can **Reprint** a badge or **Undo** a check-in.
- **Walk-ins**: **Add walk-in** creates the contact in HubSpot (or finds the existing contact by email, without changing it), checks them in and prints. If the segment is static, they're added to it as well.
- **Nothing about check-ins goes to HubSpot during the event.** Check-ins and Undo are saved on the station and to the event record in shared storage (every few seconds while online), so mistakes never reach HubSpot.
- **Submitting attendance**: when the event is over, **Finish event** (Setup) saves it and opens the event's page, where **Submit attendance to HubSpot** writes the permanent record: a static segment "<event> – Attended" with everyone who checked in, and a **Checked in at event** Custom Event on each attendee's timeline (event name, walk-in, any badge correction, at their actual check-in time). Timeline events can't be edited or deleted, which is why they wait for this step. **Submit again** after late changes brings the segment in line and logs events only for newly checked-in people. Both the segment and the event type are created automatically. Custom Events need an Enterprise hub and the scopes below; without them the segment is still created and the page says why events weren't logged.
- **Offline**: the roster and every check-in are saved in the browser, so check-in and printing keep working when Wi-Fi drops (the printer is local). Walk-ins queue and are added to HubSpot, and the event record saves to shared storage, when the connection returns. The header shows what's waiting.
- **Badge**: drawn on a canvas at 300 dpi in Plus Jakarta Sans with the ProPresenter lockup, then printed through the Mac's Brother driver on a page sized exactly to the label roll. With Chrome's kiosk printing turned on, it prints without a dialog. Long names shrink to fit, then wrap to two lines.
- **Printer check**: browsers can't see installed drivers, so Setup confirms the printer by printing a test badge and asking whether it came out. Until someone says yes, Setup shows the QL-800 driver download and steps, and the check-in screen shows a reminder.
- **Badge corrections**: **Edit badge** fixes the name or organization on one person's badge for this event. HubSpot keeps the original; the change is noted in the event record.
- **Phone preview**: **Phone preview** in the header shows a QR code. Scan it with a phone or tablet facing attendees. Whoever is selected at the desk (or being typed in as a walk-in, or being corrected) appears on it, so they can check their name and organization before staff press Print. The phone doesn't sign in; the random key in the link is its only access, and **New link** revokes old ones.
- **Past events**: the event saves to shared storage automatically while you work. **Past events** lists every event with attendance, walk-ins and corrections, and each event shows its attendee list and downloads as CSV. **Finish event** on Setup saves the final record and clears the station.

## Deploy to Vercel

1. Import this repo in Vercel (framework preset: Next.js).
2. Add these environment variables:

   | Variable | Value |
   |---|---|
   | `HUBSPOT_TOKEN` | Private app access token |
   | `STAFF_PASSWORD` | Password staff type at the station |
   | `SESSION_SECRET` | Long random string (`openssl rand -base64 32`) |
   | `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Set automatically when you add Upstash (below). `UPSTASH_REDIS_REST_*` names and a custom prefix (e.g. `bsp_KV_REST_API_URL`) also work |

3. The HubSpot private app needs these scopes:
   - `crm.lists.read` and `crm.lists.write`
   - `crm.objects.contacts.read` and `crm.objects.contacts.write`
   - `crm.objects.companies.read`
   - `analytics.behavioral_events.send` and `behavioral_events.event_definitions.read_write` (Custom Events)

### Shared storage (past events and phone preview)

In Vercel, open the project → **Storage** → **Create** → **Upstash for Redis** (the free plan is plenty), and connect it to this project. That adds the storage environment variables. Redeploy afterwards.

Without it, check-in and printing still work; Past events and Phone preview explain that storage isn't set up.

## Setting up the check-in Mac

1. Install the **Brother QL-800 driver for macOS** from [support.brother.com](https://support.brother.com). Plug the printer in over USB, add it in **System Settings → Printers & Scanners**, and make it the default printer.
2. **Turn off Editor Lite**: hold the Editor Lite button on the printer until its green light goes out. While Editor Lite is on, the QL-800 appears as a USB drive instead of a printer.
3. Load the label roll and pick the matching **Label roll** on the Setup page. The default is DK-1234 name badges (86 × 60 mm). The badge is sent as a portrait page matching the driver's paper size and turned to fit; if it comes out upside down, tick **Flip it**.
4. **One-time paper setup.** In kiosk mode Chrome doesn't choose the paper size from the page; it reuses the paper size last picked in that Chrome profile, or the driver's default (which doesn't match DK-1234, so the printer says the roll doesn't match). Set it once:
   - Quit Chrome and open the check-in profile **with** the print dialog (replace the URL with your Vercel address):

     ```bash
     open -na "Google Chrome" --args \
       --user-data-dir="$HOME/Library/Application Support/CheckInChrome" \
       https://your-check-in-site.vercel.app/setup
     ```

   - Sign in and press **Print a test badge**. In the dialog choose the QL-800, then under **More settings** set Paper size to **60mm x 86mm** (DK-1234), Margins **None** and Scale **Default**, and print.
5. Quit Chrome and open the same profile with kiosk printing, so **Print** goes straight to the printer with no dialog:

   ```bash
   open -na "Google Chrome" --args --kiosk-printing \
     --user-data-dir="$HOME/Library/Application Support/CheckInChrome" \
     https://your-check-in-site.vercel.app
   ```

   The separate profile keeps kiosk printing out of your everyday browsing. The Setup page shows both commands with your address filled in and a Copy button.
6. Print another test badge and confirm it on the Setup page. Use the nudge fields for small shifts, and **Flip it** if it comes out upside down.
7. Import the segment while you're still online. After that the station can run offline.

## Local development

```bash
cp .env.example .env.local   # fill in the values
npm install
npm run dev                  # http://localhost:3000
npm test                     # unit tests (search, HubSpot client, offline queue, events)
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
    events/…             Past events list and detail
    preview/page.tsx     Attendee-facing phone preview (no sign-in; keyed link)
    api/hubspot/…        Segment search/import, check-in, walk-ins (server-only token)
    api/events/…         Saved events (shared storage)
    api/preview/…        Phone preview relay (shared storage)
  components/            UI
  lib/
    hubspot.ts           HubSpot API client (server)
    store.ts             Local state + offline outbox (browser)
    sync.ts              Delivers the outbox to HubSpot
    label.ts             Badge layout → black-and-white image at label size
    print.ts             Prints the badge through the system printer driver
    events.ts            Autosaves the current event to shared storage
    preview.ts           Sends the selected badge to the paired phone
    storage.ts           Upstash Redis client (server)
public/
  brand/                 Logos from the Renewed Vision design system
  sw.js                  Offline caching
```
