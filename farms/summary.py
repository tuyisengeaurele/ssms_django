"""The farm summary as a PDF with the SSMS letterhead, in English, French or Kinyarwanda.

One farm on a few pages: where it is and who owns it, its rooms, its batches, what it has harvested and how many
alerts wait. The words are the ones the screens use (see core/doc_text.py).
"""
from decimal import Decimal

from django.db.models import Count, Q
from django.utils import timezone

from alerts.models import AlertLog
from batches.models import Batch
from core.doc_format import GRADES, STAGE_NAMES, count, day, num
from core.doc_text import t
from core.pdf import build_pdf, data_table, facts_table, heading, para
from harvest.models import HarvestRecord


def farm_summary_pdf(farm, made_by: str, lang: str = 'en') -> bytes:
    now = timezone.now()
    batches = list(Batch.objects.filter(farm=farm, is_active=True).select_related('room').order_by('-start_date'))

    # ── the farm ────────────────────────────────────────────────────────────
    facts = []
    if farm.location:
        facts.append((t(lang, 'bdPlace'), farm.location))
    facts += [(t(lang, 'fsOwner'), farm.owner.name or farm.owner.email), (t(lang, 'fsRegistered'), day(farm.created_at, lang))]
    story = [heading(t(lang, 'fsFarm')), facts_table(facts)]

    # ── rooms ───────────────────────────────────────────────────────────────
    story.append(heading(t(lang, 'brRooms')))
    rooms = list(
        farm.rooms.filter(is_active=True).annotate(running=Count('batches', filter=Q(batches__is_active=True))).order_by('created_at')
    )
    story.append(data_table(
        [t(lang, 'fsRoomCol'), t(lang, 'fsRoomBatchesCol')],
        [[r.name, r.running] for r in rooms],
        col_widths=[0.7, 0.3], right=[1], empty=t(lang, 'fsRoomsNone'),
    ))

    # ── batches ─────────────────────────────────────────────────────────────
    story.append(heading(t(lang, 'fsBatches')))
    rows = []
    for batch in batches:
        size = ''
        if batch.quantity:
            if batch.quantity_unit == 'WORMS':
                size = t(lang, 'bdQtyWorms', n=count(batch.quantity, lang))
            else:
                size = t(lang, 'bdQtyBoxesOne' if batch.quantity == 1 else 'bdQtyBoxes', n=count(batch.quantity, lang))
        rows.append([
            f'#{batch.pk[-8:].upper()}', STAGE_NAMES.get(batch.stage, batch.stage), day(batch.start_date, lang),
            day(batch.expected_harvest_date, lang), batch.room.name if batch.room else '-', size,
        ])
    story.append(data_table(
        [t(lang, 'fsBatchCol'), t(lang, 'bdStage'), t(lang, 'bdStarted'), t(lang, 'bdExpected'), t(lang, 'fsRoomCol'), t(lang, 'brStartedWith')],
        rows, col_widths=[0.14, 0.11, 0.16, 0.18, 0.2, 0.21], empty=t(lang, 'fsBatchesNone'),
    ))

    # ── harvest ─────────────────────────────────────────────────────────────
    story.append(heading(t(lang, 'brHarvest')))
    harvests = list(HarvestRecord.objects.live().filter(batch__farm=farm, batch__is_active=True))
    if not harvests:
        story.append(para(t(lang, 'brHarvestNone')))
    else:
        kg = sum((h.cocoon_weight_kg or Decimal(0)) for h in harvests)
        silk = sum((h.silk_yield_g or Decimal(0)) for h in harvests)
        story.append(para(t(lang, 'brHarvestSumOne' if len(harvests) == 1 else 'brHarvestSum', n=len(harvests), kg=num(round(kg, 2)), g=num(round(silk, 1)))))
        story.append(para(', '.join(f"{t(lang, 'hpGradeName', g=g)}: {sum(1 for h in harvests if h.quality_grade == g)}" for g in GRADES)))

    # ── alerts ──────────────────────────────────────────────────────────────
    story.append(heading(t(lang, 'brAlerts')))
    unseen = AlertLog.objects.filter(Q(batch__farm=farm) | Q(room__farm=farm), is_read=False).count()
    story.append(para(t(lang, 'brAlertsNone') if unseen == 0 else t(lang, 'brAlertsWaitingOne' if unseen == 1 else 'brAlertsWaiting', n=unseen)))

    story.append(para(t(lang, 'brPrepared', date=day(now, lang), name=made_by)))
    return build_pdf(t(lang, 'ptFarmSummary'), story, generated_by=made_by, subtitle=farm.name, lang=lang)
