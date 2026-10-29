import { beforeEach, describe, expect, it, vi } from 'vitest';

const download = vi.hoisted(() => ({ downloadFile: vi.fn() }));
vi.mock('./download', () => download);
vi.mock('./api', () => ({ default: { get: vi.fn() } }));

import { auditLogService, detectionReportService, reportService } from './admin.service';

const DATED = /_\d{4}-\d{2}-\d{2}\.csv$/;

beforeEach(() => {
  vi.clearAllMocks();
  download.downloadFile.mockResolvedValue(undefined);
});

describe('CSV exports go through the shared client', () => {
  it('exports the audit log with the filters on screen', async () => {
    await auditLogService.exportCsv({ action: 'LOGIN', resource: '', search: 'abc' });
    expect(download.downloadFile).toHaveBeenCalledWith('/admin/audit-log', { export: 'csv', action: 'LOGIN', search: 'abc' }, expect.stringMatching(/^audit_log/));
    expect(download.downloadFile.mock.calls[0][2]).toMatch(DATED);
  });

  it('leaves out a filter that is empty', async () => {
    await auditLogService.exportCsv({ action: '', resource: '', search: '' });
    expect(download.downloadFile.mock.calls[0][1]).toEqual({ export: 'csv' });
  });

  it('exports the system report', async () => {
    await reportService.exportCsv();
    expect(download.downloadFile).toHaveBeenCalledWith('/admin/reports', { export: 'csv' }, expect.stringMatching(/^ssms_report/));
    expect(download.downloadFile.mock.calls[0][2]).toMatch(DATED);
  });

  it('exports the disease checks with the filters on screen', async () => {
    await detectionReportService.exportCsv({ farmId: 'f1', dateFrom: '2026-01-01', dateTo: '2026-02-01', limit: 50 });
    expect(download.downloadFile).toHaveBeenCalledWith(
      '/detections/history',
      { export: 'csv', farm_id: 'f1', date_from: '2026-01-01', date_to: '2026-02-01', limit: '50' },
      expect.stringMatching(/^disease_detections/),
    );
    expect(download.downloadFile.mock.calls[0][2]).toMatch(DATED);
  });

  it('exports the disease checks with no filters', async () => {
    await detectionReportService.exportCsv({});
    expect(download.downloadFile.mock.calls[0][1]).toEqual({ export: 'csv' });
  });

  it('never calls fetch itself or reads a token from the browser', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    await auditLogService.exportCsv({});
    await reportService.exportCsv();
    await detectionReportService.exportCsv({});
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    getItem.mockRestore();
  });

  it.each([
    ['audit log', () => auditLogService.exportCsv({})],
    ['system report', () => reportService.exportCsv()],
    ['disease checks', () => detectionReportService.exportCsv({})],
  ])('lets the page know when the %s export fails', async (_name, run) => {
    download.downloadFile.mockRejectedValue(new Error('Export failed'));
    await expect(run()).rejects.toThrow('Export failed');
  });
});
