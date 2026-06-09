import { describe, it, expect } from 'vitest';
import { methodIncludesText, smsConsentRequired, consentFieldsFor, effectiveNotificationMethod } from '../smsConsent';

const NOW = new Date('2026-06-09T12:00:00.000Z');

describe('methodIncludesText', () => {
  it('is true for text and both, false for email/none', () => {
    expect(methodIncludesText('text')).toBe(true);
    expect(methodIncludesText('both')).toBe(true);
    expect(methodIncludesText('email')).toBe(false);
    expect(methodIncludesText(null)).toBe(false);
  });
});

describe('smsConsentRequired', () => {
  it('requires consent only when notifications are on and method includes text', () => {
    expect(smsConsentRequired(true, 'text')).toBe(true);
    expect(smsConsentRequired(true, 'both')).toBe(true);
    expect(smsConsentRequired(true, 'email')).toBe(false);
    expect(smsConsentRequired(false, 'text')).toBe(false); // notifications off → no SMS
  });
});

describe('consentFieldsFor (#140)', () => {
  it('records consent (true + timestamp) when SMS requested and box checked', () => {
    expect(consentFieldsFor({ notificationEnabled: true, method: 'text', consentChecked: true, now: NOW }))
      .toEqual({ sms_consent: true, sms_consent_at: NOW.toISOString() });
  });

  it('does not record consent when SMS requested but box unchecked', () => {
    expect(consentFieldsFor({ notificationEnabled: true, method: 'both', consentChecked: false, now: NOW }))
      .toEqual({ sms_consent: false, sms_consent_at: null });
  });

  it('never records consent for the email path even if the box is somehow checked', () => {
    expect(consentFieldsFor({ notificationEnabled: true, method: 'email', consentChecked: true, now: NOW }))
      .toEqual({ sms_consent: false, sms_consent_at: null });
  });

  it('clears consent when notifications are off', () => {
    expect(consentFieldsFor({ notificationEnabled: false, method: 'text', consentChecked: true, now: NOW }))
      .toEqual({ sms_consent: false, sms_consent_at: null });
  });
});

describe('effectiveNotificationMethod (#140 send-gate)', () => {
  it('passes the method through when consent is present', () => {
    expect(effectiveNotificationMethod('text', true)).toBe('text');
    expect(effectiveNotificationMethod('both', true)).toBe('both');
    expect(effectiveNotificationMethod('email', true)).toBe('email');
  });

  it('strips the text channel when consent is absent', () => {
    expect(effectiveNotificationMethod('both', false)).toBe('email'); // still email
    expect(effectiveNotificationMethod('text', false)).toBe(null);    // nothing to send
    expect(effectiveNotificationMethod('email', false)).toBe('email');
  });
});
