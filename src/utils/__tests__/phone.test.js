import { describe, it, expect } from 'vitest';
import { toE164, formatUsPhone } from '../phone.js';

describe('toE164 — Twilio E.164 normalization', () => {
  it('prefixes +1 on a bare 10-digit US number', () => {
    expect(toE164('9803229425')).toBe('+19803229425');
  });

  it('handles common free-form US formats', () => {
    expect(toE164('(980) 322-9425')).toBe('+19803229425');
    expect(toE164('980-322-9425')).toBe('+19803229425');
    expect(toE164('980.322.9425')).toBe('+19803229425');
    expect(toE164('1 (980) 322-9425')).toBe('+19803229425'); // 11-digit leading 1
  });

  it('passes an already-E.164 number through', () => {
    expect(toE164('+19803229425')).toBe('+19803229425');
  });

  it('returns null for unparseable / too-short input (caller skips the send)', () => {
    expect(toE164('')).toBeNull();
    expect(toE164(null)).toBeNull();
    expect(toE164('12345')).toBeNull();
    expect(toE164('not a phone')).toBeNull();
  });
});

describe('formatUsPhone — live display formatting', () => {
  it('progressively formats as digits arrive', () => {
    expect(formatUsPhone('980')).toBe('(980');
    expect(formatUsPhone('980322')).toBe('(980) 322');
    expect(formatUsPhone('9803229425')).toBe('(980) 322-9425');
  });

  it('strips existing punctuation and caps at 10 digits', () => {
    expect(formatUsPhone('(980) 322-9425')).toBe('(980) 322-9425');
    expect(formatUsPhone('98032294259999')).toBe('(980) 322-9425');
  });

  it('leaves international (+) input alone and handles empty', () => {
    expect(formatUsPhone('+447911123456')).toBe('+447911123456');
    expect(formatUsPhone('')).toBe('');
    expect(formatUsPhone(null)).toBe('');
  });
});
