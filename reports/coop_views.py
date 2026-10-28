"""GET /api/reports/cooperative: the cooperative report for a range of dates.

?from=YYYY-MM-DD&to=YYYY-MM-DD   the period, both days included. The default is the last 30 days.
?cooperative=<id>|all             admins only. A supervisor always gets their own cooperative.
?export=csv|pdf                  a download. Without it, the numbers as JSON.
?lang=en|fr|rw                   the language of the PDF.
"""
from django.http import HttpResponse, StreamingHttpResponse
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from cooperatives.models import Cooperative
from core.access import scope_farms
from core.csvsafe import safe_writer
from core.doc_format import clean_lang
from core.utils import api_error, api_success

from .coop import NO_COOPERATIVE, ReportInputError, cooperative_report, parse_period
from .coop_pdf import coop_report_pdf

NO_PERMISSION = "You don't have permission to do that."


class _Echo:
    def write(self, value):
        return value


def _csv_rows(report: dict):
    cooperative = report['cooperative']['name'] if report['cooperative'] else 'All cooperatives'
    totals, harvest, checks, alerts = report['totals'], report['harvest'], report['checks'], report['alerts']
    yield ['Section', 'Key', 'Value']
    yield ['Report', 'Cooperative', cooperative]
    yield ['Report', 'From', report['period']['from']]
    yield ['Report', 'To', report['period']['to']]
    yield ['Report', 'Generated At', report['generated_at']]
    yield ['Totals', 'Farms', totals['farms']]
    yield ['Totals', 'Farmers with a farm', totals['farmers']]
    yield ['Totals', 'Batches running now', totals['batches_running']]
    yield ['Totals', 'Batches started in the period', totals['batches_started']]
    yield ['Harvest', 'Records', harvest['records']]
    yield ['Harvest', 'Cocoons (kg)', harvest['total_kg']]
    yield ['Harvest', 'Silk (g)', harvest['silk_g']]
    for grade in harvest['by_grade']:
        yield ['Harvest', f'Grade {grade["grade"]} records', grade['count']]
        yield ['Harvest', f'Grade {grade["grade"]} kg', grade['total_kg']]
    yield ['Disease checks', 'Total', checks['total']]
    yield ['Disease checks', 'Found a disease', checks['found']]
    for result in checks['by_result']:
        yield ['Disease checks', f'Result: {result["result"]}', result['count']]
    yield ['Alerts', 'Total', alerts['total']]
    yield ['Alerts', 'Acknowledged', alerts['acknowledged']]
    yield ['Alerts', 'Resolved', alerts['resolved']]
    for kind in alerts['by_type']:
        yield ['Alerts', f'Type: {kind["type"]}', kind['count']]
    yield []
    yield ['Farm', 'Owner', 'Risk level today', 'Disease alerts (14 days)', 'Open air problems', 'Sensors offline', 'Batches running', 'Cocoons in the period (kg)', 'Alerts in the period']
    for farm in report['farms']:
        yield [
            farm['name'], farm['owner_name'], farm['level'], farm['disease_alerts'], farm['open_air_alerts'],
            farm['offline_devices'], farm['active_batches'], farm['harvest_kg'], farm['alerts'],
        ]


class CooperativeReportView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        user = request.user
        if user.role not in ('SUPERVISOR', 'ADMIN'):
            return api_error(NO_PERMISSION, 403)

        try:
            start, end = parse_period(request.query_params.get('from'), request.query_params.get('to'), timezone.now().date())
        except ReportInputError as error:
            return api_error(error.message, 422)

        farms = scope_farms(user)
        if user.role == 'SUPERVISOR':
            # A supervisor's cooperative is not a choice. Whatever is asked for, it is their own.
            if not user.cooperative_id:
                return api_error(NO_COOPERATIVE, 422)
            cooperative = user.cooperative
        else:
            wanted = request.query_params.get('cooperative', '')
            cooperative = None
            if wanted not in ('', 'all'):
                cooperative = Cooperative.objects.filter(pk=wanted, is_active=True).first()
                if cooperative is None:
                    return api_error("We couldn't find that cooperative.", 404)
                farms = farms.filter(owner__cooperative_id=cooperative.pk)

        report = cooperative_report(farms, cooperative, start, end)
        kind = request.query_params.get('export')
        if kind not in ('csv', 'pdf'):
            return api_success(report)

        # What leaves the screen is written down: who took a report about a cooperative's farmers, and for when.
        log_action(request, 'OTHER', 'CooperativeReport', '', f'Downloaded the cooperative report ({kind}) for {cooperative.name if cooperative else "all cooperatives"} from {start} to {end}')
        stem = f'cooperative_report_{start}_{end}'
        if kind == 'csv':
            writer = safe_writer(_Echo())
            response = StreamingHttpResponse((writer.writerow(row) for row in _csv_rows(report)), content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="{stem}.csv"'
            return response
        pdf = coop_report_pdf(report, user.name or user.email, clean_lang(request.query_params.get('lang')))
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{stem}.pdf"'
        return response
