"""The batch report as a PDF with the SSMS letterhead, in English, French or Kinyarwanda.

It says what the printable report screen says, in the same words (see core/doc_text.py). A PDF is not held to one
page, so every death entry and every disease check is listed.
"""
from decimal import Decimal

from alerts.models import StageThreshold
from alerts.room_alerts import alerts_for_batch
from core.doc_text import t
from core.pdf import MONTHS, build_pdf, data_table, facts_table, heading, para, spacer
from harvest.models import HarvestRecord
from sensors.series import batch_series, bucket_hours_for

LANGS = ('en', 'fr', 'rw')
THIRTY_DAYS = 720
GRADES = ('A', 'B', 'C')
# The usual range, for when the server has no row for a stage.
USUAL = {'temp_min': 22.0, 'temp_max': 28.0, 'hum_min': 70.0, 'hum_max': 85.0}
STAGE_NAMES = {'EGG': 'Egg', 'LARVA': 'Larva', 'PUPA': 'Pupa', 'COCOON': 'Cocoon', 'HARVEST': 'Harvest'}


def clean_lang(value) -> str:
    return value if value in LANGS else 'en'


def _num(value) -> str:
    """23.0 reads as 23, like the screen."""
    value = float(value)
    return str(int(value)) if value == int(value) else str(round(value, 2))


def _count(n: int, lang: str) -> str:
    """1234 as 1,234 in English and 1 234 in French and Kinyarwanda."""
    return f'{n:,}'.replace(',', ',' if lang == 'en' else ' ')


def _day(moment, lang: str) -> str:
    return f'{moment.day} {MONTHS[lang][moment.month - 1]} {moment.year}'


def _round1(value: float) -> float:
    """Half up, like Math.round on the screen."""
    return int(value * 10 + 0.5) / 10 if value >= 0 else -int(-value * 10 + 0.5) / 10


def summarise_conditions(points: list, bucket_hours: int, rng: dict):
    """Lowest, average and highest of a series, and how much of it was inside the range. None for an empty series."""
    if not points:
        return None
    weights = [max(p['count'], 1) for p in points]
    total = sum(weights)
    temps = [p['temperature'] for p in points]
    hums = [p['humidity'] for p in points]
    inside = sum(
        1 for p in points
        if rng['temp_min'] <= p['temperature'] <= rng['temp_max'] and rng['hum_min'] <= p['humidity'] <= rng['hum_max']
    )
    return {
        'temp_min': min(temps), 'temp_avg': _round1(sum(x * w for x, w in zip(temps, weights)) / total), 'temp_max': max(temps),
        'hum_min': min(hums), 'hum_avg': _round1(sum(x * w for x, w in zip(hums, weights)) / total), 'hum_max': max(hums),
        # Each point stands for a whole bucket, so a month of six hour buckets counts its real hours.
        'hours': len(points) * bucket_hours,
        'in_range_pct': round(inside / len(points) * 100),
    }


def _range_for(stage: str) -> dict:
    row = StageThreshold.objects.filter(stage=stage).first()
    if row is None:
        return USUAL
    return {'temp_min': row.temp_min, 'temp_max': row.temp_max, 'hum_min': row.hum_min, 'hum_max': row.hum_max}


def batch_report_pdf(batch, made_by: str, lang: str = 'en') -> bytes:
    from django.utils import timezone

    lang = clean_lang(lang)
    farm = batch.farm
    code = batch.pk[-8:].upper()
    now = timezone.now()

    # ── the batch ───────────────────────────────────────────────────────────
    quantity = ''
    if batch.quantity:
        if batch.quantity_unit == 'WORMS':
            quantity = t(lang, 'bdQtyWorms', n=_count(batch.quantity, lang))
        else:
            quantity = t(lang, 'bdQtyBoxesOne' if batch.quantity == 1 else 'bdQtyBoxes', n=_count(batch.quantity, lang))
    facts = [
        (t(lang, 'bdStage'), STAGE_NAMES.get(batch.stage, batch.stage)),
        (t(lang, 'bdFarm'), farm.name),
    ]
    if farm.location:
        facts.append((t(lang, 'bdPlace'), farm.location))
    facts += [(t(lang, 'bdStarted'), _day(batch.start_date, lang)), (t(lang, 'bdExpected'), _day(batch.expected_harvest_date, lang))]
    if batch.breed:
        facts.append((t(lang, 'bdBreed'), batch.breed))
    if quantity:
        facts.append((t(lang, 'brStartedWith'), quantity))
    if batch.notes:
        facts.append((t(lang, 'bdNotes'), batch.notes))
    story = [heading(t(lang, 'brBatch')), facts_table(facts)]

    if batch.stage != 'HARVEST':
        day_number = (now - batch.start_date).days + 1
        total_days = round((batch.expected_harvest_date - batch.start_date).total_seconds() / 86400)
        key = 'bdDayLate' if day_number > total_days else 'bdDay'
        story.append(spacer(3))
        story.append(para(t(lang, key, n=day_number, total=total_days, date=_day(batch.expected_harvest_date, lang))))

    stays = list(batch.room_stays.select_related('room').order_by('started_at'))
    if stays:
        story.append(heading(t(lang, 'brRooms')))
        for stay in stays:
            if stay.ended_at:
                story.append(para(t(lang, 'brRoomSpan', room=stay.room.name, **{'from': _day(stay.started_at, lang)}, to=_day(stay.ended_at, lang))))
            else:
                story.append(para(t(lang, 'brRoomFrom', room=stay.room.name, **{'from': _day(stay.started_at, lang)})))

    # ── conditions ──────────────────────────────────────────────────────────
    story.append(heading(t(lang, 'brConditions')))
    rng = _range_for(batch.stage)
    summary = summarise_conditions(batch_series(batch, THIRTY_DAYS), bucket_hours_for(THIRTY_DAYS), rng)
    if summary is None:
        story.append(para(t(lang, 'brNoReadings')))
    else:
        story += [
            para(t(lang, 'brTemp', min=_num(summary['temp_min']), avg=_num(summary['temp_avg']), max=_num(summary['temp_max']))),
            para(t(lang, 'brHum', min=_num(summary['hum_min']), avg=_num(summary['hum_avg']), max=_num(summary['hum_max']))),
            para(t(
                lang, 'brInRange', pct=summary['in_range_pct'], n=summary['hours'], stage=STAGE_NAMES.get(batch.stage, batch.stage),
                tmin=_num(rng['temp_min']), tmax=_num(rng['temp_max']), hmin=_num(rng['hum_min']), hmax=_num(rng['hum_max']),
            )),
        ]

    # ── deaths ──────────────────────────────────────────────────────────────
    story.append(heading(t(lang, 'brDeaths')))
    deaths = list(batch.mortality_records.filter(is_active=True).order_by('-recorded_on', '-created_at'))
    if not deaths:
        story.append(para(t(lang, 'brDeathsNone')))
    else:
        died = sum(d.count for d in deaths)
        if batch.quantity and batch.quantity_unit == 'WORMS':
            story.append(para(t(lang, 'bdDeathsTotalOf', n=_count(died, lang), q=_count(batch.quantity, lang), pct=f'{died / batch.quantity * 100:.1f}')))
        else:
            story.append(para(t(lang, 'bdDeathsTotal', n=_count(died, lang))))
        story.append(data_table(
            [t(lang, 'bdDeathsDay'), t(lang, 'brColWorms'), t(lang, 'bdDeathsNote')],
            [[_day(d.recorded_on, lang), _count(d.count, lang), d.note] for d in deaths],
            col_widths=[0.25, 0.15, 0.6], right=[1],
        ))

    # ── disease checks ──────────────────────────────────────────────────────
    story.append(heading(t(lang, 'brChecks')))
    checks = list(batch.disease_detections.order_by('-detected_at'))
    if not checks:
        story.append(para(t(lang, 'brChecksNone')))
    else:
        found = sum(1 for c in checks if c.result != 'Healthy')
        story.append(para(t(lang, 'brChecksSummaryOne' if len(checks) == 1 else 'brChecksSummary', n=len(checks), p=found)))
        story.append(data_table(
            [t(lang, 'hpColDate'), t(lang, 'brColResult'), t(lang, 'brColConfidence')],
            [[_day(c.detected_at, lang), c.result, f'{round(c.confidence * 100)} %'] for c in checks],
            col_widths=[0.3, 0.4, 0.3], right=[2],
        ))

    # ── alerts ──────────────────────────────────────────────────────────────
    story.append(heading(t(lang, 'brAlerts')))
    unseen = alerts_for_batch(batch).filter(is_read=False).count()
    if unseen == 0:
        story.append(para(t(lang, 'brAlertsNone')))
    else:
        story.append(para(t(lang, 'brAlertsWaitingOne' if unseen == 1 else 'brAlertsWaiting', n=unseen)))

    # ── harvest ─────────────────────────────────────────────────────────────
    story.append(heading(t(lang, 'brHarvest')))
    harvests = list(HarvestRecord.objects.live().filter(batch=batch))
    if not harvests:
        story.append(para(t(lang, 'brHarvestNone')))
    else:
        kg = sum((h.cocoon_weight_kg or Decimal(0)) for h in harvests)
        silk = sum((h.silk_yield_g or Decimal(0)) for h in harvests)
        story.append(para(t(lang, 'brHarvestSumOne' if len(harvests) == 1 else 'brHarvestSum', n=len(harvests), kg=_num(round(kg, 2)), g=_num(round(silk, 1)))))
        story.append(para(', '.join(f"{t(lang, 'hpGradeName', g=g)}: {sum(1 for h in harvests if h.quality_grade == g)}" for g in GRADES)))

    story.append(para(t(lang, 'brPrepared', date=_day(now, lang), name=made_by)))
    return build_pdf(t(lang, 'ptBatchReport'), story, generated_by=made_by, subtitle=t(lang, 'hpSubtitle', id=code, farm=farm.name), lang=lang)
