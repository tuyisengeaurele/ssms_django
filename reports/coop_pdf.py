"""The cooperative report as a PDF with the SSMS letterhead, in English, French or Kinyarwanda.

The words are the ones the screens use (see core/doc_text.py). The numbers are the ones in the report dict.
"""
from datetime import date

from core.doc_format import GRADES, count, day, num
from core.doc_text import t
from core.pdf import build_pdf, data_table, facts_table, heading, para, small, spacer

ALERT_TYPES = {
    'TEMPERATURE': 'alTypeTemperature', 'HUMIDITY': 'alTypeHumidity', 'DISEASE': 'alTypeDisease',
    'STAGE_CHANGE': 'alTypeStage', 'SYSTEM': 'alTypeSystem',
}
LEVELS = {'HIGH': 'fkHigh', 'MEDIUM': 'fkMedium', 'OK': 'fkOk'}


def _why(row: dict, lang: str) -> str:
    parts = []
    if row['disease_alerts']:
        parts.append(t(lang, 'fkDiseaseOne' if row['disease_alerts'] == 1 else 'fkDisease', n=row['disease_alerts']))
    if row['open_air_alerts']:
        parts.append(t(lang, 'fkAirOne' if row['open_air_alerts'] == 1 else 'fkAir', n=row['open_air_alerts']))
    if row['offline_devices']:
        parts.append(t(lang, 'fkDevicesOne' if row['offline_devices'] == 1 else 'fkDevices', n=row['offline_devices']))
    return '; '.join(parts) or '-'


def coop_report_pdf(report: dict, made_by: str, lang: str = 'en') -> bytes:
    start, end = date.fromisoformat(report['period']['from']), date.fromisoformat(report['period']['to'])
    name = report['cooperative']['name'] if report['cooperative'] else t(lang, 'crAll')
    totals, harvest, checks, alerts = report['totals'], report['harvest'], report['checks'], report['alerts']

    story = [
        para(t(lang, 'crPeriod', **{'from': day(start, lang)}, to=day(end, lang))),
        heading(t(lang, 'crSummary')),
        facts_table([
            (t(lang, 'crFarms'), count(totals['farms'], lang)),
            (t(lang, 'crFarmers'), count(totals['farmers'], lang)),
            (t(lang, 'crBatchesNow'), count(totals['batches_running'], lang)),
            (t(lang, 'crBatchesStarted'), count(totals['batches_started'], lang)),
        ]),
    ]

    story.append(heading(t(lang, 'crHarvest')))
    if harvest['records'] == 0:
        story.append(para(t(lang, 'crHarvestNone')))
    else:
        story.append(para(t(lang, 'brHarvestSumOne' if harvest['records'] == 1 else 'brHarvestSum', n=harvest['records'], kg=num(harvest['total_kg']), g=num(harvest['silk_g']))))
        by_grade = {g['grade']: g for g in harvest['by_grade']}
        story.append(data_table(
            [t(lang, 'crColType'), t(lang, 'crColCount'), t(lang, 'crColKg')],
            [[t(lang, 'hpGradeName', g=g), by_grade.get(g, {}).get('count', 0), num(by_grade.get(g, {}).get('total_kg', 0))] for g in GRADES],
            col_widths=[0.5, 0.25, 0.25], right=[1, 2],
        ))

    story.append(heading(t(lang, 'crChecks')))
    if checks['total'] == 0:
        story.append(para(t(lang, 'crChecksNone')))
    else:
        story.append(para(t(lang, 'brChecksSummaryOne' if checks['total'] == 1 else 'brChecksSummary', n=checks['total'], p=checks['found'])))
        story.append(data_table(
            [t(lang, 'brColResult'), t(lang, 'crColCount')], [[r['result'], r['count']] for r in checks['by_result']],
            col_widths=[0.7, 0.3], right=[1],
        ))

    story.append(heading(t(lang, 'crAlerts')))
    if alerts['total'] == 0:
        story.append(para(t(lang, 'crAlertsNone')))
    else:
        story.append(para(t(lang, 'crAlertsSumOne' if alerts['total'] == 1 else 'crAlertsSum', n=alerts['total'], a=alerts['acknowledged'], r=alerts['resolved'])))
        story.append(data_table(
            [t(lang, 'crColType'), t(lang, 'crColCount')], [[t(lang, ALERT_TYPES.get(r['type'], 'alTypeSystem')), r['count']] for r in alerts['by_type']],
            col_widths=[0.7, 0.3], right=[1],
        ))

    story += [heading(t(lang, 'crRisk')), small(t(lang, 'crRiskNote')), spacer(2)]
    story.append(data_table(
        [t(lang, 'crColFarm'), t(lang, 'fsOwner'), t(lang, 'crColLevel'), t(lang, 'crColWhy')],
        [[f['name'], f['owner_name'], t(lang, LEVELS[f['level']]), _why(f, lang)] for f in report['farms']],
        col_widths=[0.24, 0.22, 0.12, 0.42], empty=t(lang, 'fkNoFarms'),
    ))

    story.append(heading(t(lang, 'crEachFarm')))
    story.append(data_table(
        [t(lang, 'crColFarm'), t(lang, 'crColBatches'), t(lang, 'crColKg'), t(lang, 'crColAlerts')],
        [[f['name'], f['active_batches'], num(f['harvest_kg']), f['alerts']] for f in report['farms']],
        col_widths=[0.4, 0.2, 0.2, 0.2], right=[1, 2, 3], empty=t(lang, 'fkNoFarms'),
    ))

    return build_pdf(t(lang, 'crTitle'), story, generated_by=made_by, subtitle=name, lang=lang)
