import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { strict as assert } from "node:assert";
import { mkdir, rm, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".test-artifacts");
await mkdir(out, { recursive: true });
const dom = new JSDOM(
  '<!doctype html><html lang="en"><head><title>Cinevea test</title></head><body></body></html>',
  { url: "http://localhost/", pretendToBeVisual: true },
);
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "Node",
  "Event",
  "MutationObserver",
  "getComputedStyle",
  "localStorage",
])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
    writable: true,
  });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
class Recognition {
  constructor() {
    window.testRecognition = this;
  }
  start() {
    this.onstart?.();
  }
  stop() {
    this.onend?.();
  }
  abort() {}
}
window.SpeechRecognition = Recognition;
const testVoices = [
  { name: "Microsoft David", lang: "en-CA", voiceURI: "david" },
  { name: "Microsoft Aria Online (Natural)", lang: "en-US", voiceURI: "aria" },
];
window.speechSynthesis = {
  getVoices: () => testVoices,
  cancel: () => {},
  speak: (u) => {
    window.lastUtterance = u;
    u.onstart?.();
  },
  addEventListener: () => {},
  removeEventListener: () => {},
};
globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
  }
};
let tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
tomorrow.setHours(18, 0, 0, 0);
const testState = {
  session: null,
  calls: [],
  failHold: false,
  failConfirm: false,
  authError: "",
  tables: {
    locations: [
      { id: "loc-1", name: "Toronto", city: "Toronto", country: "Canada" },
    ],
    theatres: [{ id: "theatre-1" }],
    auditoriums: [{ id: "aud-1" }],
    showtimes: [
      { id: "show-1", movie_id: "movie-1", starts_at: tomorrow.toISOString() },
    ],
    movies: [
      {
        id: "movie-1",
        title: "The Quiet Orbit",
        poster_url: "",
        genre: "Sci-Fi",
        runtime_minutes: 120,
        age_rating: "PG",
        synopsis: "A journey through space.",
      },
    ],
    showtime_seats: Array.from({ length: 8 }, (_, row) =>
      Array.from({ length: 12 }, (_, i) => ({
        row_label: String.fromCharCode(65 + row),
        seat_number: i + 1,
        status: row === 0 && i === 11 ? "booked" : "available",
      })),
    ).flat(),
  },
};
globalThis.__CINEVEA_TEST__ = testState;
await build({
  stdin: {
    contents: `import React from 'react';import App from './src/App';import {AuthProvider} from './src/hooks/useAuth';export function TestApp(){return <React.StrictMode><AuthProvider><App/></AuthProvider></React.StrictMode>} export {ruleBasedRespond,parseTicketBreakdown,aiRespond} from './src/lib/conversation';export {rankVoices} from './src/lib/voicePreferences';export {ticketPayload} from './src/lib/ticketPayload';export {VoiceConversation} from './src/lib/voiceConversation';export {parsePaymentChoice,describeBooking} from './src/lib/payment';`,
    loader: "tsx",
    resolveDir: root,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: path.join(out, "app.mjs"),
  packages: "external",
  tsconfig: path.join(root, "tsconfig.app.json"),
  plugins: [
    {
      name: "isolated-backend",
      setup(b) {
        b.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({
          path: path.join(root, "tests/fakeSupabase.mjs"),
        }));
      },
    },
  ],
});
const React = await import("react");
const { render, screen, waitFor, within, act, cleanup } = await import(
  "@testing-library/react"
);
const user = (await import("@testing-library/user-event")).default.setup();
const {
  TestApp,
  ruleBasedRespond,
  parseTicketBreakdown,
  rankVoices,
  ticketPayload,
  VoiceConversation,
  parsePaymentChoice,
} = await import(pathToFileURL(path.join(out, "app.mjs")));
const axe = (await import("axe-core")).default;
const unexpectedErrors = [];
const originalError = console.error;
console.error = (...args) => {
  const msg = args.map(String).join(" ");
  if (msg.includes("ExperimentalWarning")) return;
  unexpectedErrors.push(msg);
  originalError(...args);
};
const originalWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0]).startsWith("AI chat unavailable"))
    console.log("Expected test: AI unavailable, rule-based fallback used.");
  else originalWarn(...args);
};
let checks = 0;
let audits = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  checks++;
};
async function heading(name) {
  await screen.findByRole("heading", { name });
  checks++;
}
async function audit(label) {
  const r = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } },
  });
  assert.equal(
    r.violations.length,
    0,
    `${label}: ${r.violations.map((v) => v.id + ": " + v.help).join(", ")}`,
  );
  checks++;
  audits++;
}
async function click(name) {
  await user.click(screen.getByRole("button", { name, exact: true }));
}
try {
  const palette = Object.fromEntries([... (await readFile(path.join(root, "src/contrast.css"), "utf8")).matchAll(/--([a-z-]+): (#[a-f0-9]{6});/g)].map(m => [m[1], m[2]]));
  const luminance = hex => hex.slice(1).match(/../g).map(v => parseInt(v,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4).reduce((sum,v,i) => sum+v*[.2126,.7152,.0722][i],0);
  for (const [a,b,min] of [["text","bg",4.5],["muted","surface",4.5],["ink","accent",4.5],["text","seat",4.5],["error-text","error-bg",4.5],["focus","surface",3],["seat-border","seat",3]]) {
    const values=[luminance(palette[a]),luminance(palette[b])].sort((a,b)=>a-b);
    check((values[1]+.05)/(values[0]+.05)>=min, `Palette ${a}/${b} meets ${min}:1`);
  }
  check(parsePaymentChoice("pay at venue") === "venue", "Spoken venue payment recognised");
  check(parsePaymentChoice("pay at venue option") === "venue", "Spoken pay at venue option recognised");
  check(parsePaymentChoice("card payment") === "card_demo", "Spoken card payment recognised");
  check(parsePaymentChoice("card payment option") === "card_demo", "Spoken card payment option recognised");
  check(parsePaymentChoice("card payment options") === "card_demo", "Spoken card payment options recognised");
  check(parsePaymentChoice("pay at venue or card payment options") === null, "Asking for both payment options does not select one");
  check(parsePaymentChoice("use credit card") === "card_demo", "Spoken simulated card recognised");
  check(parsePaymentChoice("do not use card") === null && parsePaymentChoice("what is card payment?") === null, "Payment questions and negation do not select a method");
  render(React.createElement(TestApp));
  await heading("Welcome back.");
  await audit("Sign-in labels and semantics");
  await user.click(screen.getByText("Display", {exact:true}));
  await user.click(screen.getByLabelText("Larger text"));
  check(document.documentElement.dataset.largeText === "true", "Larger text preference applies");
  await user.click(screen.getByLabelText("Larger text"));
  await user.click(screen.getByLabelText("Reduce animation"));
  check(document.documentElement.dataset.still === "true", "Animation preference applies");
  await user.click(screen.getByLabelText("Reduce animation"));
  await user.keyboard("{Escape}");
  await user.type(
    screen.getByLabelText("Email address"),
    "student@example.test",
  );
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "password-for-test",
  );
  await click("Show password");
  check(
    screen.getByLabelText("Password", { exact: true }).type === "text",
    "Password visibility works",
  );
  await click("Hide password");
  testState.authError = "Invalid login credentials";
  await click("Sign in");
  await screen.findByRole("alert");
  check(
    screen.getByRole("alert").textContent.includes("Invalid login"),
    "Auth errors are visible",
  );
  testState.authError = "";
  await click("Sign in");
  await heading("Where are you watching?");
  check(
    document.activeElement.id === "booking-main",
    "Step receives keyboard focus",
  );
  await audit("Location screen");
  await user.type(screen.getByLabelText("Search locations"), "Ottawa");
  await screen.findByText("No matching locations. Try another city.");
  checks++;
  await user.clear(screen.getByLabelText("Search locations"));
  await user.click(screen.getByRole("button", { name: /Toronto.*Canada/ }));
  await heading("Find your next favourite.");
  await audit("Movie screen");
  check(
    screen.queryByRole("complementary", { name: "Booking assistant" }) === null,
    "Assistant starts collapsed",
  );
  await user.click(
    screen.getByRole("button", { name: /Choose The Quiet Orbit/ }),
  );
  await heading("What day works for you?");
  const dateMain = screen.getByRole("main");
  await user.click(within(dateMain).getByRole("button", { name: /showtime/ }));
  await heading("Choose your showtime.");
  const timeMain = screen.getByRole("main");
  await user.click(
    within(timeMain).getByRole("button", { name: /Choose time/ }),
  );
  await heading("Who’s coming along?");
  await audit("Ticket controls");
  await waitFor(() =>
    check(
      !screen.getByRole("main").getAttribute("aria-busy") ||
        screen.getByRole("main").getAttribute("aria-busy") === "false",
      "Seats finished loading",
    ),
  );
  check(
    screen.getByRole("button", { name: /Continue to seats/ }).disabled,
    "Cannot continue without tickets",
  );
  await click("Add one Student ticket");
  await click("Add one Student ticket");
  for (let i = 0; i < 8; i++) await click("Add one Adult ticket");
  check(
    screen.getByRole("button", { name: "Add one Child (under 12) ticket" })
      .disabled,
    "Combined ticket limit is ten",
  );
  for (let i = 0; i < 8; i++) await click("Remove one Adult ticket");
  await click("Continue to seats");
  await heading("Choose your seats.");
  await audit("Seat selection");
  await act(async () => screen.getByRole("button", {name: "Row A, seat 1, available"}).focus());
  await user.keyboard("{ArrowRight}");
  check(document.activeElement.getAttribute("aria-label") === "Row A, seat 2, available", "Arrow keys move seat focus without selecting");
  await user.keyboard("{Home}{ArrowDown}");
  check(document.activeElement.getAttribute("aria-label") === "Row B, seat 1, available", "Home and vertical seat navigation work");
  check(
    within(
      screen.getByRole("button", { name: "Row A, seat 1, available" }),
    ).getByText("A1"),
    "Seat buttons display their coordinate",
  );
  check(
    screen.getByRole("button", { name: "Row A, seat 12, booked" }).disabled,
    "Booked seats blocked",
  );
  check(
    screen.getByRole("button", { name: /Review booking/ }).disabled,
    "Cannot review too few seats",
  );
  await click("Row list");
  await screen.findByLabelText("Choose a row");
  checks++;
  await click("Row A, seat 1, available");
  await click("Row A, seat 2, available");
  check(
    screen.getByRole("button", { name: "Row A, seat 3, available" }).disabled,
    "Cannot overselect seats",
  );
  testState.failHold = true;
  await user.click(screen.getByRole("button", { name: /Review booking/ }));
  await screen.findByRole("alert");
  check(
    !screen.queryByRole("heading", { name: "Everything look right?" }),
    "Failed hold does not advance",
  );
  testState.failHold = false;
  await click("Row A, seat 1, available");
  await click("Row A, seat 2, available");
  await user.click(screen.getByRole("button", { name: /Review booking/ }));
  await heading("Everything look right?");
  check(
    testState.calls.filter((c) => c.name === "reserve_showtime_seats")
      .length === 2,
    "Reservation calls sent with expected retries",
  );
  check(screen.getByRole("button", { name: /Confirm booking/ }).disabled, "Payment choice required before confirmation");
  await user.click(screen.getByRole("radio", { name: "Pay at venue (demo)" }));
  await audit("Review controls");
  testState.failConfirm = true;
  await user.click(screen.getByRole("button", { name: /Confirm booking/ }));
  await screen.findByRole("alert");
  check(
    !screen.queryByRole("heading", { name: "It’s a movie date." }),
    "Expired hold never shows success",
  );
  await click("Edit tickets");
  await heading("Who’s coming along?");
  check(
    screen.getByLabelText("Student ticket count").textContent === "2",
    "Editing tickets preserves quantities",
  );
  await click("Remove one Student ticket");
  await click("Continue to seats");
  await heading("Choose your seats.");
  await click("Row A, seat 3, available");
  await user.click(screen.getByRole("button", { name: /Review booking/ }));
  await heading("Everything look right?");
  const latestHold = testState.calls
    .filter((c) => c.name === "reserve_showtime_seats")
    .at(-1);
  check(
    latestHold.args.p_seats.length === 1 &&
      latestHold.args.p_seats[0].number === 3,
    "Edited booking reserves updated seats",
  );
  check(
    latestHold.args.p_idempotency_key !== "test-hold",
    "Changed seats do not reuse old hold token",
  );
  testState.failConfirm = false;
  await user.click(screen.getByRole("button", { name: /Confirm booking/ }));
  await heading("It’s a movie date.");
  check(
    screen.getByText(/^CV-/).textContent.length > 5,
    "Confirmation reference displayed",
  );
  await audit("Confirmation");
  const ticket = screen.getByRole("article", {
    name: "Your printable movie ticket",
  });
  check(
    within(ticket).getByText("The Quiet Orbit"),
    "Movie name appears on ticket",
  );
  check(within(ticket).getByText("A3"), "Selected seat appears on ticket");
  const qr = within(ticket).getByRole("img", {
    name: /QR code for prototype booking/,
  });
  check(qr.tagName.toLowerCase() === "svg", "Ticket QR is a vector image");
  const sharp = (await import("sharp")).default;
  const jsQR = (await import("jsqr")).default;
  const { data: qrPixels, info: qrInfo } = await sharp(
    Buffer.from(qr.outerHTML),
  )
    .resize(512, 512)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const decoded = jsQR(
    new Uint8ClampedArray(qrPixels),
    qrInfo.width,
    qrInfo.height,
  );
  check(Boolean(decoded), "Rendered QR actually decodes");
  check(
    JSON.parse(decoded.data).reference ===
      within(ticket).getByText(/^CV-/).textContent,
    "Decoded QR matches the printed booking reference",
  );
  check(
    JSON.parse(decoded.data).prototype === true,
    "QR identifies itself as a prototype ticket",
  );
  check(
    screen.getByRole("button", { name: "Print movie ticket" }),
    "Ticket has its own print control",
  );
  await user.click(screen.getByRole("button", { name: /Book another movie/ }));
  await heading("Where are you watching?");
  await click("Open assistant");
  const assistant = screen.getByRole("complementary", {
    name: "Booking assistant",
  });
  await user.click(
    within(assistant).getByRole("button", { name: "Speak", exact: true }),
  );
  await act(async () => {
    window.testRecognition.onerror({ error: "no-speech" });
  });
  check(
    screen.getByRole("alert").textContent.includes("No speech"),
    "No-speech failure gives useful feedback",
  );
  await user.click(
    within(assistant).getByRole("button", {
      name: "Try microphone again",
      exact: true,
    }),
  );
  await act(async () => {
    window.testRecognition.onresult({
      resultIndex: 0,
      results: [Object.assign([{ transcript: "Toronto" }], { isFinal: true })],
    });
  });
  await user.click(
    within(assistant).getByRole("button", { name: "Stop", exact: true }),
  );
  check(
    screen.getByLabelText("Your message").value === "Toronto",
    "Recognised speech becomes editable text",
  );
  check(
    screen.queryByRole("heading", { name: "Where are you watching?" }),
    "Speech is not automatically sent",
  );
  await user.click(
    within(assistant).getByRole("button", { name: "Send", exact: true }),
  );
  await heading("Find your next favourite.");
  await audit("Assistant form");
  await user.type(screen.getByLabelText("Your message"), "The Quiet Orbit");
  await user.click(
    within(assistant).getByRole("button", { name: "Send", exact: true }),
  );
  await heading("What day works for you?");
  await user.type(screen.getByLabelText("Your message"), "change movie");
  await user.click(
    within(assistant).getByRole("button", { name: "Send", exact: true }),
  );
  await heading("Find your next favourite.");
  await user.type(screen.getByLabelText("Your message"), "The Quiet Orbit");
  await user.click(
    within(assistant).getByRole("button", { name: "Send", exact: true }),
  );
  await heading("What day works for you?");
  await user.click(
    within(screen.getByRole("main")).getByRole("button", { name: /showtime/ }),
  );
  await heading("Choose your showtime.");
  await user.click(
    within(screen.getByRole("main")).getByRole("button", {
      name: /Choose time/,
    }),
  );
  await heading("Who’s coming along?");
  await waitFor(() =>
    assert.equal(screen.getByRole("main").getAttribute("aria-busy"), "false"),
  );
  await user.type(
    screen.getByLabelText("Your message"),
    "okay I want two adults and one student",
  );
  await user.click(
    within(assistant).getByRole("button", { name: "Send", exact: true }),
  );
  await heading("Choose your seats.");
  check(
    screen.getByText(
      "Select 3 seats. You can choose on the map or use the row list.",
    ),
    "Three mixed tickets retained",
  );
  const holdsBeforeReview = testState.calls.length;
  await user.type(screen.getByLabelText("Your message"), "review booking");
  await user.click(
    within(assistant).getByRole("button", { name: "Send", exact: true }),
  );
  check(
    testState.calls.length === holdsBeforeReview,
    "Review cannot silently auto-select or reserve seats",
  );
  await user.type(
    screen.getByLabelText("Your message"),
    "okay I want to go for h6h7 and h8",
  );
  await user.click(
    within(assistant).getByRole("button", { name: "Send", exact: true }),
  );
  await screen.findByRole("button", { name: "Row H, seat 6, selected" });
  for (const n of [6, 7, 8])
    check(
      screen
        .getByRole("button", { name: `Row H, seat ${n}, selected` })
        .getAttribute("aria-pressed") === "true",
      `H${n} selected`,
    );
  check(
    screen.getByText(
      "Select 3 seats. You can choose on the map or use the row list.",
    ),
    "Seat numbers do not change ticket count",
  );
  await user.type(
    screen.getByLabelText("Your message"),
    "why did u update it to 2 adults instead of three",
  );
  await user.click(
    within(assistant).getByRole("button", { name: "Send", exact: true }),
  );
  check(
    screen.getByRole("button", { name: "Row H, seat 8, selected" }),
    "Question preserves selected seats",
  );
  check(
    screen.getByText(
      "Select 3 seats. You can choose on the map or use the row list.",
    ),
    "Question preserves three-ticket count",
  );
  check(
    screen.getByRole("button", { name: "Review booking" }),
    "Review remains a separate explicit action",
  );
  check(
    within(assistant).getByText("Voice and reading speed"),
    "Voice options are available",
  );
  await user.click(within(assistant).getByText("Voice and reading speed"));
  await user.selectOptions(screen.getByLabelText("Guide voice"), "aria");
  await user.selectOptions(screen.getByLabelText("Reading speed"), "0.8");
  await click("Preview voice");
  check(
    window.lastUtterance.voice.voiceURI === "aria",
    "Selected voice is used for playback",
  );
  check(
    window.lastUtterance.rate === 0.8,
    "Selected speed is used for playback",
  );
  check(
    localStorage.getItem("cinevea-voice-uri") === "aria",
    "Voice preference persists locally",
  );
  await click("Stop speaking");
  await click("Start hands-free voice");
  await within(assistant).findByText(
    "Listening. Speak naturally; pause when you’re finished.",
  );
  check(
    screen.queryByRole("button", { name: "Send", exact: true }) === null,
    "Hands-free mode needs no Send button",
  );
  await act(async () => {
    window.testRecognition.onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "what is my total" }], { isFinal: true }),
      ],
    });
  });
  await within(assistant).findByText(/total \$42.97/, {}, { timeout: 5000 });
  check(
    screen.getByRole("button", { name: "Row H, seat 8, selected" }),
    "Automatic voice turn preserves selected seats",
  );
  await act(async () => window.lastUtterance.onend?.());
  await within(assistant).findByText(
    "Listening. Speak naturally; pause when you’re finished.",
    {},
    { timeout: 4000 },
  );
  const confirmationsBeforeVoice = testState.calls.filter(
    (c) => c.name === "confirm_held_booking",
  ).length;
  await act(async () => {
    window.testRecognition.onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "review booking" }], { isFinal: true }),
      ],
    });
  });
  await screen.findByRole(
    "heading",
    { name: "Everything look right?" },
    { timeout: 5000 },
  );
  await act(async () => window.lastUtterance.onend?.());
  await within(assistant).findByText(
    "Listening. Speak naturally; pause when you’re finished.",
    {},
    { timeout: 4000 },
  );
  await act(async () => {
    window.testRecognition.onresult({resultIndex: 0, results: [Object.assign([{ transcript: "pay at venue" }], {isFinal: true})]});
  });
  await within(assistant).findByText(/Payment method: Pay at venue/, {}, {timeout: 5000});
  await act(async () => window.lastUtterance.onend?.());
  await within(assistant).findByText("Listening. Speak naturally; pause when you’re finished.", {}, {timeout: 4000});
  await act(async () => {
    window.testRecognition.onresult({
      resultIndex: 0,
      results: [Object.assign([{ transcript: "yes" }], { isFinal: true })],
    });
  });
  await within(assistant).findByText(
    "Please say confirm booking to save, or say change seats to make a correction.",
    {},
    { timeout: 5000 },
  );
  check(
    testState.calls.filter((c) => c.name === "confirm_held_booking").length ===
      confirmationsBeforeVoice,
    "A casual yes cannot confirm in hands-free mode",
  );
  await act(async () => window.lastUtterance.onend?.());
  await within(assistant).findByText(
    "Listening. Speak naturally; pause when you’re finished.",
    {},
    { timeout: 4000 },
  );
  await act(async () => {
    window.testRecognition.onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "confirm booking" }], { isFinal: true }),
      ],
    });
  });
  await screen.findByRole(
    "heading",
    { name: "It’s a movie date." },
    { timeout: 5000 },
  );
  check(
    testState.calls.filter((c) => c.name === "confirm_held_booking").length ===
      confirmationsBeforeVoice + 1,
    "Explicit spoken confirmation saves exactly once",
  );
  await act(async () => window.lastUtterance.onend?.());
  await within(assistant).findByText(
    "Listening. Speak naturally; pause when you’re finished.",
    {},
    { timeout: 4000 },
  );
  await act(async () => {
    window.testRecognition.onresult({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript: "stop listening" }], { isFinal: true }),
      ],
    });
  });
  await within(assistant).findByText(
    "Voice conversation paused. The microphone is off.",
    {},
    { timeout: 5000 },
  );
  check(
    window.testRecognition.onresult === null,
    "Spoken pause turns off recognition",
  );
  await click("Use text / review mode");
  check(
    screen.getByRole("button", { name: "Speak", exact: true }),
    "Manual review mode is retained",
  );
  await user.keyboard("{Escape}");
  check(
    screen.queryByRole("complementary", { name: "Booking assistant" }) === null,
    "Escape closes assistant",
  );
  check(
    document.activeElement.textContent.includes("Open assistant"),
    "Focus returns to assistant trigger",
  );
  await user.click(screen.getByRole("button", { name: /Book another movie/ }));
  await heading("Where are you watching?");
  await user.click(screen.getByText("Start a new booking"));
  await click("Start over");
  await screen.findByRole("region", { name: "Start over confirmation" });
  await click("Keep my booking");
  check(
    !screen.queryByRole("region", { name: "Start over confirmation" }),
    "Restart can be cancelled",
  );
  await click("Account");
  await click("Sign out");
  await heading("Welcome back.");
  await click("Create an account");
  await heading("Join the movie night.");
  await user.type(screen.getByLabelText("Email address"), "new@example.test");
  await user.type(
    screen.getByLabelText("Password", { exact: true }),
    "test-password",
  );
  await click("Create account");
  await screen.findByText(
    "Check your email to confirm your address, then sign in.",
  );
  checks++;
  const mixed = {
    movie: null,
    date: null,
    showtime: null,
    seats: [],
    step: "seats",
    ticketCount: 3,
    ticketBreakdown: { adult: 2, student: 1 },
  };
  for (const text of [
    "okay I want to go for h6h7 and h8",
    "H6 H7 H8",
    "h6h7h8",
  ]) {
    const r = ruleBasedRespond(text, mixed, []);
    check(
      r.action?.type === "select_seats",
      `Seat input is not parsed as tickets: ${text}`,
    );
    assert.deepEqual(r.action.seats, ["H6", "H7", "H8"]);
    checks++;
  }
  for (const text of ["to", "for", "okay I want to go for"])
    check(
      parseTicketBreakdown(text) === null,
      `Filler is not a ticket quantity: ${text}`,
    );
  for (const text of [
    "why did u update it to 2 adults instead of three",
    "why did you change my tickets",
    "do not change my tickets",
    "are you able to listen to me",
  ])
    check(
      !ruleBasedRespond(text, mixed, []).action,
      `Question/negation cannot mutate: ${text}`,
    );
  const correction = ruleBasedRespond(
    "change tickets to one adult and one student",
    mixed,
    [],
  );
  check(
    correction.action?.type === "set_tickets" && correction.action.count === 2,
    "Explicit ticket changes still work",
  );
  const movieHelp = ruleBasedRespond(
    "what movies are showing",
    { ...mixed, step: "greeting" },
    [
      {
        id: "test",
        title: "A Test Movie",
        genre: "Action",
        rating: "PG",
        showtimes: [],
        duration: 100,
        description: "",
        poster: "",
      },
    ],
  );
  check(
    movieHelp.text.includes("A Test Movie"),
    "Catalog questions still list movies",
  );
  const ranked = rankVoices([
    { name: "Microsoft David", lang: "en-CA", voiceURI: "david" },
    {
      name: "Microsoft Aria Online (Natural)",
      lang: "en-US",
      voiceURI: "aria",
    },
  ]);
  check(
    ranked[0].voiceURI === "aria",
    "Preferred feminine named voice outranks generic male regional default",
  );
  check(
    JSON.parse(ticketPayload("CV-TEST")).reference === "CV-TEST",
    "QR carries the exact booking reference",
  );
  const port = {
    callbacks: null,
    starts: 0,
    stops: 0,
    startListening(c) {
      this.callbacks = c;
      this.starts++;
      c.onStart?.();
    },
    stopListening() {
      this.stops++;
    },
    stopSpeaking() {},
  };
  const turns = [];
  const snapshots = [];
  let audioSpeaking = false;
  const engine = new VoiceConversation({
    speech: port,
    send: async (t) => {
      turns.push(t);
      audioSpeaking = true;
    },
    busy: () => false,
    speaking: () => audioSpeaking,
    update: (s) => snapshots.push(s),
    pauseMs: 8,
  });
  engine.start();
  await new Promise((r) => setTimeout(r, 180));
  port.callbacks.onResult({ transcript: "two adults", isFinal: true });
  port.callbacks.onEnd();
  await new Promise((r) => setTimeout(r, 25));
  check(
    turns.length === 1 && turns[0] === "two adults",
    "Pause and native end cannot double-send a turn",
  );
  const started = port.starts;
  await new Promise((r) => setTimeout(r, 250));
  check(port.starts === started, "Microphone stays off during guide speech");
  audioSpeaking = false;
  await new Promise((r) => setTimeout(r, 650));
  check(
    port.starts > started,
    "Listening resumes automatically after playback",
  );
  engine.stop();
  const stopped = port.starts;
  await new Promise((r) => setTimeout(r, 50));
  check(
    port.starts === stopped,
    "Closing a voice session cancels its callbacks",
  );
  engine.start();
  await new Promise((r) => setTimeout(r, 180));
  port.callbacks.onError("Microphone permission was denied");
  check(
    snapshots.at(-1).phase === "error",
    "Permission failures pause hands-free mode",
  );
  engine.stop(false);
  check(unexpectedErrors.length === 0, "No unexpected React or DOM errors");
  console.log(
    `PASS: ${checks} assertions across sign-in, booking, failed holds, expired confirmation, edits, speech review, assistant focus, and restart. ${audits} automated WCAG label/structure audits passed (colour contrast and real screen-reader behaviour require browser/manual review).`,
  );
} finally {
  cleanup();
  dom.window.close();
  await rm(out, { recursive: true, force: true });
}
