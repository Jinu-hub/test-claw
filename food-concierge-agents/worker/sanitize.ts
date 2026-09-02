/** Matches digit groups that look like credit card numbers (13–19 digits). */
const CARD_LIKE_PATTERN = /\b[\d\s-]{13,28}\b/g;

export function redactSensitiveText(text: string): string {
  return text.replace(CARD_LIKE_PATTERN, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 13 && digits.length <= 19) {
      return "[REDACTED]";
    }
    return match;
  });
}
