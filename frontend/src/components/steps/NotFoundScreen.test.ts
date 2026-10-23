import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { NotFoundScreen } from './NotFoundScreen';

describe('NotFoundScreen 404 page', () => {
  it('renders 404 heading and back to start button', () => {
    const html = renderToStaticMarkup(
      React.createElement(NotFoundScreen, {
        onBackToStart: () => {},
      })
    );

    expect(html).toContain('404 — Page Not Found');
    expect(html).toContain("We couldn&#x27;t find that path");
    expect(html).toContain('Back to start');
    expect(html).toContain('The landscape ahead is uncharted');
  });
});
