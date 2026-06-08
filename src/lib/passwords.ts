const UPPERCASE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWERCASE_CHARS = "abcdefghjkmnpqrstuvwxyz";
const DIGIT_CHARS = "23456789";
const SYMBOL_CHARS = "!@#$%";
const PASSWORD_CHARS = `${UPPERCASE_CHARS}${LOWERCASE_CHARS}${DIGIT_CHARS}${SYMBOL_CHARS}`;
const EMAIL_SUFFIX_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

function secureIndex(length: number): number {
  if (length <= 0) return 0;

  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.getRandomValues) {
    const max = 256 - (256 % length);
    const bytes = new Uint8Array(1);

    do {
      cryptoApi.getRandomValues(bytes);
    } while (bytes[0] >= max);

    return bytes[0] % length;
  }

  return Math.floor(Math.random() * length);
}

function pick(chars: string): string {
  return chars.charAt(secureIndex(chars.length));
}

export function generateTemporaryPassword(length = 14): string {
  const minLength = Math.max(length, 12);
  const chars = [
    pick(UPPERCASE_CHARS),
    pick(LOWERCASE_CHARS),
    pick(DIGIT_CHARS),
    pick(SYMBOL_CHARS),
  ];

  for (let i = chars.length; i < minLength; i++) {
    chars.push(pick(PASSWORD_CHARS));
  }

  for (let i = chars.length - 1; i > 0; i--) {
    const j = secureIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join("");
}

export function generateEmailSuffix(length = 6): string {
  let suffix = "";

  for (let i = 0; i < length; i++) {
    suffix += pick(EMAIL_SUFFIX_CHARS);
  }

  return suffix;
}
