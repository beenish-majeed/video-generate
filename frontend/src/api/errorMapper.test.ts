import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mapAPIError } from './errorMapper';

describe('mapAPIError', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    // Ensure navigator is defined in Node test environment
    if (!globalThis.navigator) {
      // @ts-ignore
      globalThis.navigator = { onLine: true };
    }
  });

  afterEach(() => {
    if (originalNavigator) {
      globalThis.navigator = originalNavigator;
    } else {
      // @ts-ignore
      delete globalThis.navigator;
    }
  });

  it('maps offline state cleanly', () => {
    // @ts-ignore
    globalThis.navigator = { onLine: false };
    const result = mapAPIError(new Error('Fetch failed'));
    expect(result.kind).toBe('network');
    expect(result.title).toBe('Studio Connection Lost');
    expect(result.message).toContain('you are offline');
  });

  it('maps 413 Payload Too Large error', () => {
    // @ts-ignore
    globalThis.navigator = { onLine: true };
    const error = new Error('HTTP Error 413: Payload Too Large');
    const result = mapAPIError(error);
    expect(result.kind).toBe('too_large');
    expect(result.title).toBe('File is a Bit Too Large');
    expect(result.message).toContain('20MB limit');
  });

  it('maps 401 Unauthorized / 403 Forbidden error', () => {
    // @ts-ignore
    globalThis.navigator = { onLine: true };
    const error = new Error('HTTP Error 401: Unauthorized');
    const result = mapAPIError(error);
    expect(result.kind).toBe('auth');
    expect(result.title).toBe('Studio Keys Unverified');
  });

  it('maps 400 Bad Request / Validation error', () => {
    // @ts-ignore
    globalThis.navigator = { onLine: true };
    const error = new Error('HTTP Error 400: Bad Request - invalid file format');
    const result = mapAPIError(error);
    expect(result.kind).toBe('validation');
    expect(result.title).toBe('Photo Format Not Recognized');
    expect(result.message).toContain('PNG, JPG, or WEBP');
  });

  it('maps 500 Internal Server Error', () => {
    // @ts-ignore
    globalThis.navigator = { onLine: true };
    const error = new Error('HTTP Error 500: Internal Server Error');
    const result = mapAPIError(error);
    expect(result.kind).toBe('server');
    expect(result.title).toBe('Studio Server Pause');
  });

  it('maps raw network fetch error', () => {
    // @ts-ignore
    globalThis.navigator = { onLine: true };
    const error = new Error('TypeError: Failed to fetch');
    const result = mapAPIError(error);
    expect(result.kind).toBe('network');
    expect(result.title).toBe('Connection Hiccup');
  });
});
