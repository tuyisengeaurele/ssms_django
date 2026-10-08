import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { setReducedMotion } from '../test/setup';
import { HowItWorks, stepForProgress } from './HowItWorks';

function renderHow() {
  return render(
    <LanguageProvider>
      <HowItWorks />
    </LanguageProvider>,
  );
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

describe('stepForProgress', () => {
  it('maps scroll progress to a step', () => {
    expect(stepForProgress(0, 4)).toBe(0);
    expect(stepForProgress(0.24, 4)).toBe(0);
    expect(stepForProgress(0.26, 4)).toBe(1);
    expect(stepForProgress(0.51, 4)).toBe(2);
    expect(stepForProgress(0.99, 4)).toBe(3);
  });

  it('stays inside the range for odd values', () => {
    expect(stepForProgress(1, 4)).toBe(3);
    expect(stepForProgress(1.7, 4)).toBe(3);
    expect(stepForProgress(-0.3, 4)).toBe(0);
    expect(stepForProgress(Number.NaN, 4)).toBe(0);
  });
});

describe('HowItWorks', () => {
  beforeEach(() => {
    localStorage.clear();
    setViewport(1280, 800);
  });
  afterEach(() => {
    setViewport(1024, 768);
  });

  it('is the how it works section with its heading and four ordered steps', () => {
    const { container } = renderHow();
    expect(container.querySelector('section')).toHaveAttribute('id', 'how');
    expect(screen.getByRole('heading', { level: 2, name: 'From egg to harvest in four steps.' })).toBeInTheDocument();
    const steps = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    const titles = steps.map((li) => within(li).getByRole('heading', { level: 3 }).textContent);
    expect(titles).toEqual(['Register your batch', 'Watch the room', 'Check with a photo', 'Harvest with records']);
  });

  it('marks only the first step as current when pinned and shows one sample screen', () => {
    const { container } = renderHow();
    expect(container.querySelector('section')).not.toHaveClass('how--stacked');
    const current = container.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent('Register your batch');
    expect(screen.getAllByRole('img', { name: /^Illustration/ })).toHaveLength(1);
  });

  it('stacks every step with its own screen when motion is reduced', () => {
    setReducedMotion(true);
    const { container } = renderHow();
    expect(container.querySelector('section')).toHaveClass('how--stacked');
    expect(screen.getAllByRole('img', { name: /^Illustration/ })).toHaveLength(4);
  });

  it('stacks on short screens such as a phone held sideways', () => {
    setViewport(844, 390);
    const { container } = renderHow();
    expect(container.querySelector('section')).toHaveClass('how--stacked');
  });

  it('stacks on narrow screens', () => {
    setViewport(390, 844);
    const { container } = renderHow();
    expect(container.querySelector('section')).toHaveClass('how--stacked');
  });
});
