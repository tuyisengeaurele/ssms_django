import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('./api', () => ({ default: { get } }));

import { downloadFile, fileNameFrom } from './download';

let clicked: HTMLAnchorElement[];
let revoke: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clicked = [];
  revoke = vi.fn();
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this);
  });
  get.mockReset();
});

afterEach(() => vi.restoreAllMocks());

const answer = (disposition?: string) => ({
  data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }),
  headers: disposition ? { 'content-disposition': disposition } : {},
});

describe('fileNameFrom', () => {
  it('reads a quoted name', () => {
    expect(fileNameFrom('attachment; filename="ssms_report_2026-10-28.pdf"', 'x.pdf')).toBe('ssms_report_2026-10-28.pdf');
  });

  it('reads an unquoted name', () => {
    expect(fileNameFrom('attachment; filename=report.pdf', 'x.pdf')).toBe('report.pdf');
  });

  it('falls back when there is no header', () => {
    expect(fileNameFrom(undefined, 'x.pdf')).toBe('x.pdf');
  });

  it('falls back when the header has no name', () => {
    expect(fileNameFrom('attachment', 'x.pdf')).toBe('x.pdf');
  });

  it('never lets a name climb out of the downloads folder', () => {
    expect(fileNameFrom('attachment; filename="../../evil.pdf"', 'x.pdf')).toBe('evil.pdf');
  });
});

describe('downloadFile', () => {
  it('asks for the file as a blob with the filters', async () => {
    get.mockResolvedValue(answer('attachment; filename="audit_log_2026-10-28.pdf"'));
    await downloadFile('/admin/audit-log', { export: 'pdf', action: 'LOGIN' }, 'audit_log.pdf');
    expect(get).toHaveBeenCalledWith('/admin/audit-log', { params: { export: 'pdf', action: 'LOGIN' }, responseType: 'blob' });
  });

  it('saves it under the name the server gave', async () => {
    get.mockResolvedValue(answer('attachment; filename="audit_log_2026-10-28.pdf"'));
    await downloadFile('/admin/audit-log', { export: 'pdf' }, 'audit_log.pdf');
    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('audit_log_2026-10-28.pdf');
    expect(clicked[0].href).toContain('blob:fake');
  });

  it('uses the fallback name when the server gave none', async () => {
    get.mockResolvedValue(answer());
    await downloadFile('/admin/reports', { export: 'pdf' }, 'ssms_report.pdf');
    expect(clicked[0].download).toBe('ssms_report.pdf');
  });

  it('lets go of the temporary address and leaves no link behind', async () => {
    get.mockResolvedValue(answer());
    await downloadFile('/admin/reports', { export: 'pdf' }, 'r.pdf');
    expect(revoke).toHaveBeenCalledWith('blob:fake');
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('passes a failed request on so the page can say so', async () => {
    get.mockRejectedValue(new Error('403'));
    await expect(downloadFile('/admin/reports', { export: 'pdf' }, 'r.pdf')).rejects.toThrow('403');
    expect(clicked).toHaveLength(0);
  });
});
