# Cinevea: Contrast Edition (v4)

This is a separate working copy based on your uploaded `Cinevea-main (1).zip` (archive commit `66ef7af368fc84d72efbc2f5e19885891643db9a`). The original ZIP and hosted site have not been changed.

The v1, v2 and v3 ZIPs are still your fallbacks. This archive contains the full project again; use this version in a separate folder. Do not copy your old `node_modules` into it—run `npm ci` because the QR component and tests add dependencies.

## Try it first, without replacing anything

1. Extract this ZIP into a new folder, separate from your existing project.
2. Open the folder containing `package.json` in VS Code.
3. Use Node.js 22.12 or newer (a current Node 22 or Node 24 release is suitable).
4. In the VS Code PowerShell terminal, run:

```powershell
npm ci
Copy-Item .env.production .env.local
npm run dev
```

If `.env.local` already exists and contains your settings, keep it; do not overwrite it. The included `.env.production` is the same file supplied in your latest archive. It contains the team's public Supabase connection settings, not an OpenAI secret. Copying it makes those settings available during local development. Keep private/service-role keys out of browser code.

Open the localhost address printed by Vite in Chrome. Sign in using your existing project account. No new Supabase migrations or function deployments are required for this redesign.

## What is new in v4

- Neutral midnight navy and violet replace the red/gold theme. Brighter secondary text, visible borders and consistent selected states improve contrast. Completed/current progress markers share the violet accent; labels distinguish their states.
- A circular floating Movie guide button opens the assistant throughout booking. Escape closes it and returns keyboard focus.
- Display settings on sign-in and booking offer larger text, stronger contrast/borders and reduced animation; preferences stay on this device.
- The seat map supports arrow keys, Home and End, with one Tab entry point. Seat coordinates remain visible. The row-list alternative remains available.
- Review includes a demo payment-method choice, available by buttons or voice: “pay at venue” or “use credit card”. No money or card details are collected. The choice is local prototype state and is not saved in the existing Supabase booking schema.
- Review reads out movie, date, time, ticket categories, seats, total and payment choice. Missing payment blocks confirmation; failed reservations/saves provide spoken and visible feedback.
- The ticket adds a film-strip header and demo payment label while preserving a printable, readable layout and QR reference.
- A privacy disclosure explains browser speech processing, optional server-side AI and collected booking information.
- Existing hands-free turn-taking, pause choices, stop/repeat/back/change/restart commands and explicit final confirmation remain supported.

## AI and voice

The existing Supabase `chat` function can use OpenAI when the deployed server has its secret and configuration. This ZIP does not add or activate a paid service. Never place an OpenAI secret in a VITE variable. Catalogue conversation has a local fallback. Ticket, seat and final confirmation changes stay locally validated so an AI response cannot silently rewrite them.

A complex AI model is not needed to meet the brief. More natural, interruptible neural voice would require a separate backend/audio integration; browser speech cannot promise ChatGPT-like expressiveness. The guide's blinking, smiling and listening animations represent interface states, not emotion recognition.

Initial sign-in and microphone permission still need to be completed. Hands-free booking does not replace operating-system sign-in, browser permission prompts or the print dialog's accessibility tools. Users who cannot activate a button can use keyboard, switch/assistive input, or their operating system's voice control to start the mode.

## Changes since the first redesign

- Fixed the reported “two adults and one student” → “h6h7 and h8” bug. Quantities and ticket categories are preserved when selecting seats.
- Ticket/seat/review stages now use predictable local interpretation rather than letting a model invent booking changes. Catalog conversation still supports AI and its fallback.
- Questions and negations do not trigger ticket changes; ambiguous or unnumbered categories ask for clarification.
- Seat labels select seats for review; they do not automatically reserve or confirm. Review never silently chooses seats.
- Added a voice selector, reading-speed selector, and Preview voice. Available named feminine voices are preferred over a generic regional default. Preferences stay on this device.
- Added a perforated admission-ticket layout, vector QR code, location, movie, date, showtime, seats, quantities and price. Printing isolates the ticket rather than stretching the confirmation table across the page.
- QR content is a prototype format identifier and the booking reference. It is not a real cinema validation service.

## What changed

- A neutral navy/violet cinema palette, more space, readable text, and less visual noise.
- One booking step at a time; location is now included in the progress indicator.
- Searchable location list and movie grid. Extra movie filters stay inside a disclosure.
- Compact, expandable booking summary. The assistant starts closed and is available throughout.
- A new vector guide avatar, with restrained speaking animation and reduced-motion support.
- Labelled ticket quantities, a combined ten-ticket limit, and preserved counts when editing tickets.
- Large seat buttons, selection indicators beyond colour, and an alternative row-list selector.
- Review with per-section Edit actions and a complete, printable confirmation.
- Associated form labels, visible keyboard focus, focus management, polite status announcements, and reduced-motion support.
- In review mode, voice input stays editable with explicit Start/Stop/Send. In hands-free mode, messages send automatically after a pause.
- Microphone failures explain what happened and leave typing and clicking available.
- Simple commands such as “change movie” and “change date” go directly to the requested step.
- Failed reservations remain on seat selection. A failed save never displays a successful confirmation.
- Repeated reservation/confirmation clicks are guarded while a request is pending.
- New isolated regression tests; see VALIDATION.md.

## Important limits to understand

This is a tested candidate for local review, not a promise of zero bugs or certified accessibility. The test backend is simulated and does not connect to your Supabase project.

The local browser could not be launched in the execution environment, and the cloud browser could not reach its localhost server. Browser visual inspection, narrow-screen reflow, zoom, real screen-reader operation, actual account access, real seat holds, OpenAI responses, and your microphone/accent still need local checks.

The microphone continues to use the browser speech service in both modes. The existing Whisper function/helper remain in the repository, but are not newly connected to the microphone. The redesign improves control, feedback, and recovery; it cannot guarantee transcription accuracy.

The existing database API has no explicit release-current-hold operation. If you edit after reserving seats, your old seats can remain unavailable until the existing five-minute expiry. The interface explains this; changed selections get a fresh hold rather than reusing the wrong token. No database functions were modified to change this policy.

The backend must support the existing `reserve_showtime_seats` and `confirm_held_booking` functions. The old fallback that inserted a booking without a verified hold has been removed intentionally. If your backend reservation functions are not deployed/working, the app now reports that problem rather than pretending seats were reserved.

This remains a university prototype: imported movie metadata, synthetic screenings, and no real payment collection. Local display of screening times follows the existing device-local behaviour.

## Bring the changes into your repository after review

First ensure your existing work is committed or backed up. In your existing Git checkout, create a branch:

```powershell
git switch -c feat/khushi-accessible-ui
```

Copy the edited/new files listed in CHANGES.md from this working copy into that checkout. Preserve your checkout's `.git` folder and existing `.env.local`. Do not replace the repository by deleting it. Copy both `package.json` and `package-lock.json`, then run `npm ci` again.

Run the checks below and review `git diff` before committing:

```powershell
npm run typecheck
npm run lint
npm run build
npm test
```

Keep the original branch/ZIP until the new version passes your live checks. To return to the old website code, switch back to the original branch after saving the redesign on its own branch. No changes have been pushed or published by this work.

## Where to edit next

- `src/components/booking/BookingViews.tsx`: active location/movie/date/time/tickets/seats/review/confirmation screens.
- `src/App.tsx`: booking state, catalog loading, reservation calls, assistant actions, and overall layout.
- `src/index.css`: design foundation, responsive layouts, focus, reduced motion, and print rules.
- `src/components/VoiceInput.tsx`: draft transcript and microphone UI.
- `src/lib/speech.ts`: speech recognition lifecycle and spoken replies.
- `src/lib/conversation.ts`: state-aware interpretation; seat labels and questions cannot silently change ticket quantities.

Older components such as `SeatMap.tsx`, `MovieGrid.tsx`, and `BookingSummary.tsx` remain for reference and are not the active booking screens. Edit BookingViews instead.

## Where the movies come from

The frontend reads the current shared Supabase database. That is a real hosted database, not a list hardcoded into the new screen.

The source included in the supplied ZIP contains `sync-omdb`, which starts with eight default titles, imports their movie metadata, and generates demonstration theatres/showtimes. Its request can supply a different list of titles, so the actual database is not necessarily limited to eight movies.

There is also a scheduled workflow that calls a deployed `sync-movieglu` function, but that function's source was not included in the supplied archive. Its deployment, credentials, outputs and real-world data provenance have not been verified. Therefore this update does not claim all listed films/showtimes are live cinema availability.

Refreshing this UI only re-reads saved database listings. To show automatically updated real cinema programmes, the team must confirm a working licensed showtimes feed, coverage, refresh schedule, and server credentials. Real seat inventory and actual ticket sales require a cinema/booking integration beyond a metadata/showtimes feed. No additional provider has been enabled or billed in this update.
