"""Giving the alerts that were kept per batch before rooms the room of their batch. Run once by a migration, safe to run again."""

# The kinds a room owns from now on. Stage changes and disease alerts are about one batch and stay with it.
ROOM_KINDS = ['TEMPERATURE', 'HUMIDITY', 'SYSTEM']


def backfill(apps) -> None:
    """Only open alerts need it: they are the ones a new reading has to find, to resolve or not to repeat.
    Resolved ones are history and keep their batch. An alert keeps its batch, so old pages still show it."""
    AlertLog = apps.get_model('alerts', 'AlertLog')
    Batch = apps.get_model('batches', 'Batch')

    open_alerts = AlertLog.objects.filter(
        type__in=ROOM_KINDS, resolved_at__isnull=True, room__isnull=True, batch__isnull=False,
    )
    for batch_id in open_alerts.values_list('batch_id', flat=True).distinct():
        room_id = Batch.objects.filter(pk=batch_id, is_active=True).values_list('room_id', flat=True).first()
        if room_id is not None:
            open_alerts.filter(batch_id=batch_id).update(room_id=room_id)
