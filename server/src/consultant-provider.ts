export function consultantGenerationOptions(baseUrl: string, model: string, scope: boolean) {
  let google = false;
  try { google = new URL(baseUrl).hostname === 'generativelanguage.googleapis.com'; } catch { /* configuration is checked by the route */ }
  if (google && /^gemini-3\./.test(model)) {
    // Gemini's output budget also includes reasoning; 20 tokens cannot reliably classify scope.
    return { max_tokens: scope ? 2048 : 4096, reasoning_effort: 'minimal' };
  }
  if (google && /^gemini-2\.5-flash/.test(model)) {
    return { max_tokens: scope ? 20 : 700, reasoning_effort: 'none' };
  }
  return { max_tokens: scope ? 20 : 700 };
}
