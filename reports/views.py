"""
GET /api/admin/reports          → JSON summary
GET /api/admin/reports?export=csv → CSV download
"""
import csv
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import Count, Sum, Avg
from django.db.models.functions import TruncDay
from django.http import StreamingHttpResponse
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated

from audit_log.models import AuditLog
from batches.models import Batch
from farms.models import Farm
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection
from core.utils import api_success, api_error

User = get_user_model()


class IsAdmin(IsAuthenticated):
    def has_permission(self, request, view):
        return super().has_permission(request, view) and request.user.role == 'ADMIN'


class ReportSummaryView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        now = timezone.now()
        thirty_days_ago = now - timedelta(days=30)

        # ── Users ────────────────────────────────────────────────────────────────
        total_users = User.objects.filter(is_active=True).count()
        users_by_role = list(
            User.objects.filter(is_active=True)
            .values('role')
            .annotate(count=Count('id'))
        )
        registrations_30d = list(
            User.objects
            .filter(created_at__gte=thirty_days_ago)
            .annotate(day=TruncDay('created_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
            .values('day', 'count')
        )
        # Serialise dates to ISO strings
        registrations_30d = [
            {'day': r['day'].strftime('%Y-%m-%d'), 'count': r['count']}
            for r in registrations_30d
        ]

        # ── Farms ────────────────────────────────────────────────────────────────
        total_farms = Farm.objects.filter(is_active=True).count()

        # ── Batches ──────────────────────────────────────────────────────────────
        total_batches = Batch.objects.filter(is_active=True).count()
        batches_by_stage = list(
            Batch.objects.filter(is_active=True)
            .values('stage')
            .annotate(count=Count('id'))
        )

        # ── Harvests ─────────────────────────────────────────────────────────────
        total_harvests = HarvestRecord.objects.count()
        agg = HarvestRecord.objects.aggregate(
            total_kg=Sum('cocoon_weight_kg'),
            total_silk_g=Sum('silk_yield_g'),
            avg_kg=Avg('cocoon_weight_kg'),
        )
        harvests_by_grade = list(
            HarvestRecord.objects
            .values('quality_grade')
            .annotate(count=Count('id'), total_kg=Sum('cocoon_weight_kg'))
            .order_by('quality_grade')
        )
        harvests_by_grade = [
            {
                'grade': r['quality_grade'],
                'count': r['count'],
                'total_kg': float(r['total_kg'] or 0),
            }
            for r in harvests_by_grade
        ]

        # ── Disease Detections ────────────────────────────────────────────────────
        total_detections = DiseaseDetection.objects.count()
        detections_by_result = list(
            DiseaseDetection.objects
            .values('result')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        detections_30d = list(
            DiseaseDetection.objects
            .filter(detected_at__gte=thirty_days_ago)
            .annotate(day=TruncDay('detected_at'))
            .values('day')
            .annotate(count=Count('id'))
            .order_by('day')
            .values('day', 'count')
        )
        detections_30d = [
            {'day': r['day'].strftime('%Y-%m-%d'), 'count': r['count']}
            for r in detections_30d
        ]

        # ── Audit Log ─────────────────────────────────────────────────────────────
        audit_by_action = list(
            AuditLog.objects
            .filter(created_at__gte=thirty_days_ago)
            .values('action')
            .annotate(count=Count('id'))
            .order_by('-count')
        )

        # ── Top Farmers ───────────────────────────────────────────────────────────
        top_farmers = list(
            Farm.objects
            .filter(is_active=True)
            .values('owner__name', 'owner__email')
            .annotate(farm_count=Count('id'))
            .order_by('-farm_count')[:10]
        )
        top_farmers = [
            {'name': r['owner__name'], 'email': r['owner__email'], 'farm_count': r['farm_count']}
            for r in top_farmers
        ]

        payload = {
            'generated_at': now.isoformat(),
            'users': {
                'total': total_users,
                'by_role': users_by_role,
                'registrations_30d': registrations_30d,
            },
            'farms': {'total': total_farms},
            'batches': {'total': total_batches, 'by_stage': batches_by_stage},
            'harvests': {
                'total': total_harvests,
                'total_kg': float(agg['total_kg'] or 0),
                'total_silk_g': float(agg['total_silk_g'] or 0),
                'avg_kg': round(float(agg['avg_kg'] or 0), 2),
                'by_grade': harvests_by_grade,
            },
            'detections': {
                'total': total_detections,
                'by_result': detections_by_result,
                'detections_30d': detections_30d,
            },
            'audit': {'actions_30d': audit_by_action},
            'top_farmers': top_farmers,
        }

        if request.query_params.get('export') == 'csv':
            return self._csv_response(payload)

        return api_success(payload)

    def _csv_response(self, payload: dict):
        class Echo:
            def write(self, value): return value

        def rows():
            writer = csv.writer(Echo())
            yield writer.writerow(['Section', 'Key', 'Value'])
            yield writer.writerow(['Report', 'Generated At', payload['generated_at']])
            yield writer.writerow(['Users', 'Total', payload['users']['total']])
            for r in payload['users']['by_role']:
                yield writer.writerow(['Users', f'Role: {r["role"]}', r['count']])
            yield writer.writerow(['Farms', 'Active Total', payload['farms']['total']])
            yield writer.writerow(['Batches', 'Active Total', payload['batches']['total']])
            for r in payload['batches']['by_stage']:
                yield writer.writerow(['Batches', f'Stage: {r["stage"]}', r['count']])
            yield writer.writerow(['Harvests', 'Total Records', payload['harvests']['total']])
            yield writer.writerow(['Harvests', 'Total Cocoon (kg)', payload['harvests']['total_kg']])
            yield writer.writerow(['Harvests', 'Total Silk (g)',    payload['harvests']['total_silk_g']])
            yield writer.writerow(['Harvests', 'Avg Cocoon (kg)',   payload['harvests']['avg_kg']])
            for r in payload['harvests']['by_grade']:
                yield writer.writerow(['Harvests', f'Grade {r["grade"]} count', r['count']])
                yield writer.writerow(['Harvests', f'Grade {r["grade"]} kg',    r['total_kg']])
            yield writer.writerow(['Detections', 'Total', payload['detections']['total']])
            for r in payload['detections']['by_result']:
                yield writer.writerow(['Detections', f'Result: {r["result"]}', r['count']])
            for r in payload['audit']['actions_30d']:
                yield writer.writerow(['Audit (30d)', f'Action: {r["action"]}', r['count']])
            yield writer.writerow([])
            yield writer.writerow(['Top Farmers', 'Name', 'Email', 'Farms'])
            for f in payload['top_farmers']:
                yield writer.writerow(['', f['name'], f['email'], f['farm_count']])

        import csv as _csv
        response = StreamingHttpResponse(rows(), content_type='text/csv; charset=utf-8')
        date_str = payload['generated_at'][:10]
        response['Content-Disposition'] = f'attachment; filename="ssms_report_{date_str}.csv"'
        return response
