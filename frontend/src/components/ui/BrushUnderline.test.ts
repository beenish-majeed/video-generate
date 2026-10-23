import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { BrushUnderline } from './BrushUnderline';

describe('BrushUnderline component', () => {
  it('renders SVG brush stroke with custom or default color and opacity', () => {
    const defaultHtml = renderToStaticMarkup(React.createElement(BrushUnderline));
    expect(defaultHtml).toContain('<svg');
    expect(defaultHtml).toContain('preserveAspectRatio="none"');
    expect(defaultHtml).toContain('var(--blob-peach, #FFC9B5)');

    const customHtml = renderToStaticMarkup(
      React.createElement(BrushUnderline, { color: '#B9DDFF', height: 16 })
    );
    expect(customHtml).toContain('#B9DDFF');
    expect(customHtml).toContain('height:16px');
  });
});
