# Validation and remaining checks

## Automated results

- TypeScript: `npm run typecheck` passed.
- ESLint: no errors. One pre-existing Fast Refresh warning in `src/hooks/useAuth.tsx` remains.
- Production bundle: `npm run build` passed.
- Isolated regression suite: `npm test` passed, 122 assertions and 8 axe-core WCAG label/structure audits.
- The suite runs the actual app in React Strict Mode with jsdom and a test-only fake Supabase service. It never creates a real account, hold, or booking.
- An intentionally unavailable AI service exercises the existing rule-based fallback.
- Source comparison verified that Supabase function/migration files and `.env.production` were unchanged from the supplied ZIP.

## v4 additions

Tests additionally cover demo payment selection by buttons and hands-free speech, disabled confirmation before a method is selected, rejection of payment questions/negation, keyboard seat navigation, display preferences and seven mathematical contrast checks of the actual CSS tokens. Text pairs meet at least 4.5:1 and tested focus/seat borders meet at least 3:1. These token checks are not a full rendered-page contrast audit.

## Covered journeys

- Sign-in form labels, password reveal, incorrect credentials, successful sign-in.
- Location search and no-match recovery; movie/date/showtime selection.
- No-ticket blocking, ten-ticket combined limit, ticket quantity editing.
- Occupied-seat blocking, insufficient selection blocking, row-list selection, selection limit.
- Seat-hold failure stays on seat selection; retry succeeds.
- Expired/failed confirmation does not display success.
- Editing quantities reserves the updated seats with a new idempotency key.
- Successful confirmation displays a booking reference; another booking resets the flow.
- Assistant starts collapsed; explicit open/close; Escape and focus return.
- No-speech feedback and retry.
- Recognised speech remains a draft until Send is selected.
- Rule-based movie selection when AI is unavailable; direct “change movie” command.
- Restart confirmation can be cancelled.
- Sign-out and email-confirmation signup feedback.
- No unexpected React/DOM console errors in the test run.

## What these results do not prove

jsdom is a simulated DOM, not a full rendering engine. Automated accessibility checks exclude colour contrast because that needs browser layout/canvas support. They do not certify WCAG compliance.

A local Chromium launch was blocked by the execution environment. The available remote browser could not connect to the local development server. Consequently no actual browser screenshots or visual sign-off were produced. Responsive CSS, forced-colour handling, reduced motion, and print styles are implemented but still need visual verification.

Real microphone transcription, accent handling, browser permissions, browser/device differences, live authentication, OpenAI responses, seat contention, and expiry policies require local testing against the team's deployed services. No live account credentials were supplied and no backend writes were made during validation.

## Before updating the hosted website

1. Follow START-HERE.md in a separate extracted folder.
2. Sign in to the actual project and complete one booking. Check it was saved correctly.
3. Test a failed/expired seat hold and changing seats after a hold. Existing holds can persist for five minutes; the interface explains that limitation.
4. Complete a booking using only Tab, Shift+Tab, Enter, Space, and Escape. Check focus remains visible.
5. Try the seat-row list and confirm the seat count and price are correct.
6. Test with NVDA/Chrome or another screen reader. Check step labels, errors, selected seats, and confirmation announcements.
7. Check at 320/390px width, a desktop width, 200% zoom, and 400% zoom. Only the seat map should need local horizontal scrolling.
8. Speak movie names, dates, ticket categories and seat labels. Check the editable transcript. Test microphone denial, silence, and a disconnected microphone; use the text alternative each time.
9. Confirm disabling spoken replies and Stop speaking work on the device.
10. Check high-contrast/forced-colour mode, reduced-motion settings, and printed confirmation.
11. Conduct the proposal's three-user usability test and record any remaining issues before merging.

## Cinema Edition regression results

The v2 suite additionally replays the exact reported mixed-ticket and H6/H7/H8 conversation, including the follow-up question. Ticket categories/counts remain unchanged during seat selection and questions. Tests cover explicit ticket corrections, non-numeric filler rejection, seat review without automatic seat selection, and normal movie-list questions.

The ticket QR SVG is rendered to pixels using sharp and decoded with jsQR inside the test suite. The decoded payload must contain the exact printed booking reference and identify itself as a prototype ticket. This validates the code data, not a real cinema check-in service.

Browser speech synthesis is simulated to verify selected voice/rate, local preference persistence, preview and Stop speaking. This does not measure how an actual installed voice sounds. Real voice timbre, recognition accuracy, print rendering and physical QR scanning should still be checked locally.

## Marquee Edition (v3) validation

The same complete suite now passes 122 assertions and eight automated label/structure accessibility audits. New tests use simulated recognition/playback to verify:

- Recognised text is sent after a silence interval without Stop or Send clicks.
- Recognition resumes after playback, with no recognition session open during playback.
- “Stop listening” pauses the session and clears microphone callbacks.
- Manual review/typing mode remains available.
- Browser end events and silence events cannot double-submit a turn.
- Stopping/closing the controller prevents later listening restarts.
- Microphone errors pause automatic mode.
- An actual hands-free test journey reaches review and saves only after “confirm booking”; casual “yes” does not save.
- Seat coordinates remain visible as text within seat buttons.

These are state/DOM/controller tests. They do not reproduce actual microphone quality, browser permission UI, audio echo, expressive neural voices, mobile browser limitations, pixel layout or physical access needs. Sticky navigation and theatre/chair drawing were implemented in CSS but have not been visually verified in a full browser here. Initial microphone permission and OS/browser dialogs require the user's preferred assistive input.

Additional manual checks: test slow speech with the longer pause option; turn spoken replies on/off; close/hide the assistant during listening; switch tabs and verify the microphone pauses; try denial/network failures; use OS voice control or a switch to activate Start hands-free voice. Verify sticky progress at 200% zoom, narrow screens and long seat maps. Test with at least three users, including accessibility needs relevant to the proposal, before claiming the interface meets those needs.

Catalogue provenance: the included OMDb importer has eight default titles and generated screening data. A scheduled workflow references a deployed `sync-movieglu` function whose source was not supplied. No assertion was made that the deployed provider or real cinema inventory was verified. Refresh listings only re-reads the shared database. All backend function/migration files and production connection settings match the original supplied archive.
