import { describe, it, expect } from 'vitest';
import { extractWhatsNewSection } from '../whatsNewParser.js';

describe('extractWhatsNewSection', () => {
  it('extracts the section under ## What\'s New', () => {
    const body = `## Summary\nDev details here.\n\n## What's New\nShare any load by email or text right from the load details.\n\n## Acceptance criteria\n- [ ] stuff`;
    expect(extractWhatsNewSection(body)).toBe('Share any load by email or text right from the load details.');
  });

  it('section runs to end of body when it is last', () => {
    const body = `## Summary\nx\n\n## What's New\nLine one.\nLine two.`;
    expect(extractWhatsNewSection(body)).toBe('Line one.\nLine two.');
  });

  it('is case-insensitive and accepts curly apostrophes and ### levels', () => {
    expect(extractWhatsNewSection(`### WHAT’S NEW\nBlurb.`)).toBe('Blurb.');
    expect(extractWhatsNewSection(`## what's new\nBlurb.`)).toBe('Blurb.');
  });

  it('returns null when the section is missing or empty', () => {
    expect(extractWhatsNewSection('## Summary\nNo section here.')).toBeNull();
    expect(extractWhatsNewSection(`## What's New\n\n## Next heading\nx`)).toBeNull();
    expect(extractWhatsNewSection('')).toBeNull();
    expect(extractWhatsNewSection(null)).toBeNull();
  });

  it('does not match the phrase outside a heading', () => {
    expect(extractWhatsNewSection(`The what's new banner is described here.`)).toBeNull();
  });
});
