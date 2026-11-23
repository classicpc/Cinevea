# v4 changes

Added `src/contrast.css`, `src/components/AccessibilitySettings.tsx` and `src/lib/payment.ts`. Updated App, Header, AuthScreen, BookingViews, GuideAvatar and MovieTicket for the floating assistant, persistent display preferences, keyboard seat navigation, complete spoken review, simulation-only payment choice, privacy explanation and cinematic ticket styling. No database migration, Supabase function or public connection setting was changed.

## Requirement coverage in code

- Visible conversational avatar and voice/text booking: present, with browser speech and optional existing AI service.
- Movie/date/time/ticket/seat selection, correction without restart, review and explicit confirmation: present.
- Status, pause, repeat, back/change/restart and recovery from invalid input, speech failure, seat reservation failure and expired confirmation: present.
- Readable feedback, keyboard operation, alternative seat list, visible text for spoken replies, reduced motion and display controls: present.
- Payment scenario: prototype method choice only; real transactions are outside this version.
- Additional languages and genre-themed avatar variants were optional in the proposal. Decorative genre rings exist; multilingual conversation is not implemented or claimed.

These features do not establish accessibility compliance or real speech accuracy. Live services and assistive-technology behavior still need verification. This version focuses on code; it does not supply fabricated user-testing results.

## Earlier changes

# Files changed — Cinema Edition

## Edited

| File | Purpose |
| --- | --- |
| src/App.tsx | Booking layout; wire new screen components; focus and assistant controls; direct edit commands; guarded seat holds and confirmation errors |
| src/index.css | New visual system, responsive layouts, focus, reduced motion, and confirmation print rules |
| src/components/AuthScreen.tsx | New account screen with labels, password visibility, and connection feedback |
| src/components/Header.tsx | Simplified brand/account disclosure, keyboard dismissal, sign-out feedback |
| src/components/VoiceInput.tsx | Reviewable voice draft; explicit start/stop/send; labelled input and errors |
| src/components/ChatTranscript.tsx | Readable conversation history and replay controls |
| src/lib/speech.ts | Recognition lifecycle, explicit recovery, and stale-callback guards |
| package.json / package-lock.json | Isolated test dependencies and npm test; Node requirement |
| .github/workflows/deploy.yml | Build with Node 22 instead of Node 20 |
| .gitignore | Ignore temporary test artifacts |
| README.md | Link to setup guide and correct Node prerequisite |

## Added

- src/components/booking/BookingViews.tsx
- src/lib/bookingPresentation.ts
- tests/run.mjs
- tests/fakeSupabase.mjs
- START-HERE.md
- CHANGES.md
- VALIDATION.md

## Preserved

All Supabase SQL migrations and edge functions, public Supabase configuration, authentication API calls, database table names, ticket prices, and the backend API contracts are preserved. The deployment still targets the original GitHub Pages setup when you choose to commit/push it.

The test fake is loaded only by a special esbuild test plugin. It is never imported by the website build and introduces no guest login or authentication bypass into the application.

## Additional v2 changes

- `src/lib/conversation.ts`: explicit quantities, seat-before-ticket priority, inquiry/negation guards, deterministic booking mutations, and mixed ticket context.
- `src/lib/voicePreferences.ts`: preferred named voices, with English and natural/enhanced voice ranking.
- `src/components/VoiceSettings.tsx`: voice/speed selection and preview.
- `src/components/GuideAvatar.tsx`: accessible decorative vector character.
- `src/components/booking/MovieTicket.tsx`: ticket design and QR component.
- `src/lib/ticketPayload.ts`: explicit prototype QR format and reference payload.
- `package.json` / lock: `qrcode.react` for the ticket; `sharp` and `jsqr` for test-only QR rasterisation/decoding.
- Additional regression tests replay the exact reported conversation and verify voice settings and a decoded QR.

The Supabase edge functions, migrations, production connection values, and ticket prices remain unchanged. No OpenAI key, server deployment, or migration is required for the new QR ticket, avatar, or browser voice preferences.

## Additional v3 changes

- `src/lib/voiceConversation.ts`: cancellable, pause-based voice turns, playback/listening separation, idle/error handling and double-send protection.
- `src/components/HandsFreeVoice.tsx`: visible automatic mode, pause/resume, adjustable sentence timing and privacy controls.
- `src/App.tsx`: voice-mode lifecycle, spoken repeat/start-over controls, explicit final-save phrase, persistent assistant step context and catalogue refresh wiring.
- `src/components/booking/BookingViews.tsx`: labelled chair coordinates, refresh action and catalogue source note.
- `src/components/GuideAvatar.tsx`: state-dependent eyes/wink and warm reference palette.
- `src/index.css`: red/gold cinema theme, sticky progress, chair/screen design and reduced-motion-compatible animation.
- Regression suite includes automatic sending, automatic listening resumption, spoken pause, no duplicate sends, cancellation and recognition errors.

No database migrations or edge functions were changed. The missing deployed `sync-movieglu` source has not been reconstructed or modified.
