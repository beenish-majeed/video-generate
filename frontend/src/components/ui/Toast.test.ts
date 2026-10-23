import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { ToastProvider, toast } from './Toast';

describe('Toast notification system', () => {
  it('renders ToastProvider wrapper and accessible notification region', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        ToastProvider,
        null,
        React.createElement('div', null, 'App Content')
      )
    );

    expect(html).toContain('App Content');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Notifications"');
  });

  it('exposes toast helper functions without throwing', () => {
    expect(typeof toast.success).toBe('function');
    expect(typeof toast.info).toBe('function');
    expect(typeof toast.error).toBe('function');

    // Calling outside provider does not throw
    expect(() => toast.success('Test success')).not.toThrow();
    expect(() => toast.info('Test info')).not.toThrow();
    expect(() => toast.error('Test error')).not.toThrow();
  });
});
