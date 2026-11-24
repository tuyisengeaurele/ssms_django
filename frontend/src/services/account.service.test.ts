import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.hoisted(() => vi.fn());
const patch = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ default: { post, patch, delete: del } }));

import { accountService } from './account.service';

let clicked: HTMLAnchorElement[];

beforeEach(() => {
  clicked = [];
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  post.mockReset();
  patch.mockReset();
  del.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe('downloadMyData', () => {
  it('posts the password in the body, asks for a file and hands it to the browser under the name the server chose', async () => {
    post.mockResolvedValue({
      data: new Blob(['{}'], { type: 'application/json' }),
      headers: { 'content-disposition': 'attachment; filename="ssms-my-data-2026-11-24.json"' },
    });
    await accountService.downloadMyData('Secret123');
    expect(post).toHaveBeenCalledWith('/auth/export', { password: 'Secret123' }, { responseType: 'blob' });
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('ssms-my-data-2026-11-24.json');
  });

  it('falls back to a dated name when the server sent none', async () => {
    post.mockResolvedValue({ data: new Blob(['{}']), headers: {} });
    await accountService.downloadMyData('Secret123');
    expect(clicked[0].download).toMatch(/^ssms-my-data-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it('turns the refusal the server sent as a file back into the answer a page can read', async () => {
    const body = { success: false, code: 'wrong_password', message: 'x', errors: { password: ['That password is not right.'] } };
    const error = Object.assign(new Error('Request failed'), {
      isAxiosError: true,
      response: { status: 422, data: new Blob([JSON.stringify(body)], { type: 'application/json' }) },
    });
    post.mockRejectedValue(error);
    await expect(accountService.downloadMyData('Wrong')).rejects.toBe(error);
    expect(error.response.data).toEqual(body);
    expect(clicked).toHaveLength(0);
  });

  it('keeps an error that has no readable body as it is', async () => {
    const error = Object.assign(new Error('Network Error'), { isAxiosError: true });
    post.mockRejectedValue(error);
    await expect(accountService.downloadMyData('x')).rejects.toBe(error);
  });
});

describe('the profile photo', () => {
  it('sends the chosen file as a form field named photo and returns the account the server answers with', async () => {
    patch.mockResolvedValue({ data: { data: { id: 'u1' } } });
    const picked = new File(['x'], 'me.png', { type: 'image/png' });
    const res = await accountService.uploadPhoto(picked);
    expect(patch).toHaveBeenCalledTimes(1);
    const [url, body] = patch.mock.calls[0];
    expect(url).toBe('/auth/me/photo');
    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get('photo')).toBe(picked);
    expect(res.data.data).toEqual({ id: 'u1' });
  });

  it('removes the photo with a delete', async () => {
    del.mockResolvedValue({ data: { data: { id: 'u1', photoUrl: null } } });
    await accountService.removePhoto();
    expect(del).toHaveBeenCalledWith('/auth/me/photo');
  });
});
