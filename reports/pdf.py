"""The system report as a PDF with the SSMS letterhead. It says what the report screen says."""
from core.pdf import build_pdf, data_table, facts_table, heading, small, spacer

ROLES = {'ADMIN': 'Administrators', 'SUPERVISOR': 'Supervisors', 'FARMER': 'Farmers'}
STAGES = {'EGG': 'Egg', 'LARVA': 'Larva', 'PUPA': 'Pupa', 'COCOON': 'Cocoon', 'HARVEST': 'Harvest'}


def _label(names: dict, key: str) -> str:
    return names.get(key, key.replace('_', ' ').title())


def report_pdf(payload: dict, made_by: str) -> bytes:
    users, harvests, detections = payload['users'], payload['harvests'], payload['detections']
    story = [
        heading('Users'),
        facts_table([('Active users', users['total']), *[(_label(ROLES, r['role']), r['count']) for r in users['by_role']]]),
        heading('Farms and batches'),
        facts_table([('Active farms', payload['farms']['total']), ('Active batches', payload['batches']['total'])]),
        heading('Batches by stage'),
        data_table(['Stage', 'Batches'], [[_label(STAGES, r['stage']), r['count']] for r in payload['batches']['by_stage']],
                   col_widths=[0.7, 0.3], right=[1], empty='No batches yet.'),
        heading('Harvests'),
        facts_table([
            ('Harvest records', harvests['total']),
            ('Cocoons harvested (kg)', harvests['total_kg']),
            ('Silk (g)', harvests['total_silk_g']),
            ('Average per record (kg)', harvests['avg_kg']),
        ]),
        spacer(),
        data_table(['Grade', 'Records', 'Cocoons (kg)'], [[f'Grade {r["grade"]}', r['count'], r['total_kg']] for r in harvests['by_grade']],
                   col_widths=[0.5, 0.25, 0.25], right=[1, 2], empty='No harvests recorded yet.'),
        heading('Disease checks'),
        facts_table([('Checks made', detections['total'])]),
        spacer(),
        data_table(['Result', 'Checks'], [[r['result'], r['count']] for r in detections['by_result']],
                   col_widths=[0.7, 0.3], right=[1], empty='No disease checks yet.'),
        heading('Activity in the last 30 days'),
        data_table(['Action', 'Entries'], [[r['action'], r['count']] for r in payload['audit']['actions_30d']],
                   col_widths=[0.7, 0.3], right=[1], empty='No activity in the last 30 days.'),
        heading('Farmers with the most farms'),
        data_table(['Name', 'Email', 'Farms'], [[f['name'], f['email'], f['farm_count']] for f in payload['top_farmers']],
                   col_widths=[0.35, 0.5, 0.15], right=[2], empty='No farms yet.'),
        spacer(),
        small('Counts include active records only. Deleted farms, batches and harvests are not counted.'),
    ]
    return build_pdf('System report', story, generated_by=made_by, subtitle='What SSMS holds today, in numbers')
