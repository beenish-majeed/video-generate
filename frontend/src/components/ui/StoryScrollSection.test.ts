import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { StoryScrollSection } from './StoryScrollSection';

describe('StoryScrollSection Unit Tests', () => {
  it('1. Renders section markup with children', () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        StoryScrollSection,
        { className: 'test-story-section' },
        React.createElement('h2', null, 'Chapter 1: The Beginning')
      )
    );
    expect(markup).toContain('Chapter 1: The Beginning');
    expect(markup).toContain('test-story-section');
  });

  it('2. Supports rendering as div or article', () => {
    const divMarkup = renderToStaticMarkup(
      React.createElement(
        StoryScrollSection,
        { as: 'div', id: 'custom-div' },
        'Div Content'
      )
    );
    expect(divMarkup).toContain('id="custom-div"');
    expect(divMarkup).toContain('Div Content');

    const articleMarkup = renderToStaticMarkup(
      React.createElement(
        StoryScrollSection,
        { as: 'article', id: 'custom-article' },
        'Article Content'
      )
    );
    expect(articleMarkup).toContain('id="custom-article"');
    expect(articleMarkup).toContain('Article Content');
  });
});
