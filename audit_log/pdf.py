"""The audit log as a PDF with the SSMS letterhead. It keeps the filters the screen had."""
from core.pdf import build_pdf, data_table, para, small, spacer


def _filters_line(action: str, resource: str, search: str) -> str:
    parts = []
    if action:
        parts.append(f'Action: {action}')
    if resource:
        parts.append(f'Resource: {resource}')
    if search:
        parts.append(f'Search: {search}')
    return ', '.join(parts) if parts else 'No filters.'


def _count_line(shown: int, total: int) -> str:
    if total > shown:
        return f'Showing the latest {shown} of {total} entries.'
    return '1 entry.' if total == 1 else f'{total} entries.'


def audit_pdf(entries, total: int, action: str, resource: str, search: str, made_by: str) -> bytes:
    shown = len(entries)
    rows = [
        [e.created_at.strftime('%Y-%m-%d %H:%M'), e.user_name or e.user_email or '-', e.action, e.resource, e.detail]
        for e in entries
    ]
    story = [small(_filters_line(action, resource, search)), para(_count_line(shown, total))]
    if total > shown:
        story.append(small('Use the CSV export for the full list.'))
    story += [spacer(2), data_table(
        ['When (UTC)', 'User', 'Action', 'Resource', 'Detail'], rows,
        col_widths=[0.16, 0.19, 0.1, 0.13, 0.42], empty='No entries match.',
    )]
    return build_pdf('Audit log', story, generated_by=made_by, subtitle='Who did what, newest first')
