// Cinevea configuration
// To enable AI-powered conversation, paste your OpenAI API key below.
// Get one at https://platform.openai.com/api-keys
// If left empty, the app uses a built-in rule-based conversation engine
// that fully handles the booking flow without any external API.

export const OPENAI_API_KEY = ""; // <-- Paste your OpenAI API key here, e.g. "sk-..."
export const OPENAI_MODEL = "gpt-4o-mini";

export const isAIEnabled = () => OPENAI_API_KEY.trim().length > 0;
