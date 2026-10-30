"""The log of worms that died in a batch, /api/batches/<id>/mortality."""
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from core.access import get_batch_or_404
from core.timeutil import aware
from core.utils import api_error, api_success

from .models import MortalityRecord
from .serializers import MortalityCreateSerializer, MortalityRecordSerializer


class BatchMortalityView(APIView):
    """GET lists the entries, latest day first. POST adds one (the owner or an admin)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        batch = get_batch_or_404(request.user, pk)
        rows = batch.mortality_records.filter(is_active=True).order_by('-recorded_on', '-created_at')
        return api_success(MortalityRecordSerializer(rows, many=True).data)

    def post(self, request, pk):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        batch = get_batch_or_404(request.user, pk)
        serializer = MortalityCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)

        today = timezone.localdate()
        day = serializer.validated_data.get('recorded_on', today)
        if day > today:
            return api_error('Please choose a day that is not in the future.', 422, {'recorded_on': ['Please choose a day that is not in the future.']})
        if day < timezone.localtime(aware(batch.start_date)).date():
            return api_error('Please choose a day on or after the batch started.', 422, {'recorded_on': ['Please choose a day on or after the batch started.']})

        record = MortalityRecord.objects.create(
            batch=batch, count=serializer.validated_data['count'],
            note=serializer.validated_data.get('note', ''), recorded_on=day,
        )
        log_action(request, 'CREATE', 'Mortality', record.pk, f'Recorded {record.count} deaths in batch {batch.pk}')
        return api_success(MortalityRecordSerializer(record).data, 'Deaths recorded.', 201)


class BatchMortalityDetailView(APIView):
    """DELETE hides one entry. The row is kept."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk, record_id):
        if request.user.role not in ('FARMER', 'ADMIN'):
            return api_error("You don't have permission to do that.", 403)
        batch = get_batch_or_404(request.user, pk)
        record = batch.mortality_records.filter(pk=record_id, is_active=True).first()
        if record is None:
            return api_error("We couldn't find that entry.", 404)
        record.is_active = False
        record.save(update_fields=['is_active'])
        log_action(request, 'DELETE', 'Mortality', record.pk, f'Deleted an entry of {record.count} deaths in batch {batch.pk}')
        return api_success(None, 'Entry deleted.')
