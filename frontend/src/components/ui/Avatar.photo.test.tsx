import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import Avatar from './Avatar';

const circle = (container: HTMLElement) => container.firstElementChild as HTMLElement;

describe('An avatar with a photo', () => {
  it('shows the initials when there is no photo', () => {
    const { container } = render(<Avatar name="Aline Uwase" />);
    expect(circle(container)).toHaveTextContent('AU');
    expect(container.querySelector('img')).toBeNull();
    expect(circle(container)).toHaveClass('row-avatar');
  });

  it('shows the photo instead of the initials, with no text of its own, because the name is written beside it', () => {
    const { container } = render(<Avatar name="Aline Uwase" photoUrl="/api/photos/abc" />);
    const image = container.querySelector('img') as HTMLImageElement;
    expect(image).toHaveAttribute('src', '/api/photos/abc');
    expect(image).toHaveAttribute('alt', '');
    expect(circle(container)).toHaveAttribute('aria-hidden', 'true');
    expect(circle(container)).not.toHaveTextContent('AU');
  });

  it('falls back to the initials when the photo cannot be loaded', () => {
    const { container } = render(<Avatar name="Aline Uwase" photoUrl="/api/photos/gone" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(circle(container)).toHaveTextContent('AU');
  });

  it('tries again when the person gets a new photo after one failed', () => {
    const { container, rerender } = render(<Avatar name="Aline Uwase" photoUrl="/api/photos/gone" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    rerender(<Avatar name="Aline Uwase" photoUrl="/api/photos/new" />);
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/photos/new');
  });

  it('takes the class of the circle it sits in', () => {
    const { container } = render(<Avatar name="Aline Uwase" photoUrl="/api/photos/abc" className="identity-avatar" />);
    expect(circle(container)).toHaveClass('identity-avatar');
    expect(circle(container)).not.toHaveClass('row-avatar');
  });

  it('treats an empty address as no photo', () => {
    const { container } = render(<Avatar name="Aline Uwase" photoUrl="" />);
    expect(container.querySelector('img')).toBeNull();
  });
});
