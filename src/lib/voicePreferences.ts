// Browsers expose voice names and languages, but no reliable gender field.
const preferredNames = [
  "aria",
  "jenny",
  "samantha",
  "ava",
  "zira",
  "susan",
  "hazel",
  "karen",
  "moira",
  "tessa",
  "victoria",
];
export function rankVoices<
  T extends { name: string; lang: string; voiceURI: string },
>(voices: T[]): T[] {
  const score = (v: T) => {
    const english = /^en\b/i.test(v.lang);
    const preferred = preferredNames.findIndex((n) =>
      v.name.toLowerCase().includes(n),
    );
    return (
      (english ? 1000 : 0) +
      (preferred >= 0 ? 500 - preferred : 0) +
      (/natural|neural|premium|enhanced/i.test(v.name) ? 100 : 0)
    );
  };
  return [...voices].sort(
    (a, b) => score(b) - score(a) || a.name.localeCompare(b.name),
  );
}
