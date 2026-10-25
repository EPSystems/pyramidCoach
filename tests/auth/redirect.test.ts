import { describe, expect, it } from 'vitest';
import { resolveOrigin, safeNext } from '@/lib/utils/redirect';

const h = (entries: Record<string, string>) => new Headers(entries);

describe('safeNext', () => {
  it('accepts same-site relative paths', () => {
    expect(safeNext('/today')).toBe('/today');
    expect(safeNext('/session/abc?x=1')).toBe('/session/abc?x=1');
  });
  it('rejects anything that could leave the site', () => {
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/a\\b', 'javascript:alert(1)', '/\tevil', '/%0a', 'today', '', null, undefined]) {
      const out = safeNext(bad);
      expect(out.startsWith('/') && !out.startsWith('//')).toBe(true);
      if (bad !== '/%0a') expect(out).toBe('/today');
    }
  });
});

describe('resolveOrigin', () => {
  it('prefers APP_URL', () => {
    expect(resolveOrigin('https://pyramid-coach.vercel.app/', h({ host: 'preview.vercel.app' }))).toBe('https://pyramid-coach.vercel.app');
  });
  it('falls back to the forwarded request origin', () => {
    expect(resolveOrigin(undefined, h({ 'x-forwarded-host': 'pyramid-coach.vercel.app', 'x-forwarded-proto': 'https', host: 'internal:3000' }))).toBe(
      'https://pyramid-coach.vercel.app',
    );
    expect(resolveOrigin('', h({ host: 'pyramid-coach.vercel.app' }))).toBe('https://pyramid-coach.vercel.app');
    expect(resolveOrigin(undefined, h({ origin: 'https://app.example.com' }))).toBe('https://app.example.com');
  });
  it('uses http for a local host', () => {
    expect(resolveOrigin(undefined, h({ host: 'localhost:3000' }))).toBe('http://localhost:3000');
  });
  it('never uses localhost when a real request origin exists', () => {
    expect(resolveOrigin('http://localhost:3000', h({ host: 'pyramid-coach.vercel.app' }))).toBe('https://pyramid-coach.vercel.app');
    expect(resolveOrigin(undefined, h({ host: 'pyramid-coach.vercel.app' }))).not.toMatch(/localhost/);
  });
  it('ignores an invalid APP_URL', () => {
    expect(resolveOrigin('not a url', h({ host: 'pyramid-coach.vercel.app' }))).toBe('https://pyramid-coach.vercel.app');
  });
});
