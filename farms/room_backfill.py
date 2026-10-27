"""Putting the batches that existed before rooms into a room. Run once by a migration, and safe to run again."""


def backfill(apps) -> None:
    """Every farm that has batches gets a room named "Room 1". Each batch without a stay gets one, from its own start.

    A batch that is deleted goes in no room, but its history is kept as a stay that has ended.
    """
    Farm = apps.get_model('farms', 'Farm')
    Room = apps.get_model('farms', 'RearingRoom')
    Batch = apps.get_model('batches', 'Batch')
    Stay = apps.get_model('batches', 'BatchRoomStay')

    for farm in Farm.objects.filter(batches__isnull=False).distinct():
        room = Room.objects.filter(farm=farm, name='Room 1', is_active=True).first() or Room.objects.create(farm=farm, name='Room 1')
        for batch in Batch.objects.filter(farm=farm, room_stays__isnull=True):
            Stay.objects.create(
                batch=batch,
                room=room,
                started_at=batch.start_date,
                ended_at=None if batch.is_active else batch.updated_at,
            )
            if batch.is_active:
                Batch.objects.filter(pk=batch.pk).update(room=room)
