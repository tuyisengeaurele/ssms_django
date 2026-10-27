"""Putting the devices and readings that existed before rooms into a room. Run once by a migration, safe to run again."""


def backfill(apps) -> None:
    """A reading gets the room its batch is in, or was in last. A device gets the room of its batch, or else the
    first room of its farm. Anything that has no room to go to is left as it is."""
    Batch = apps.get_model('batches', 'Batch')
    Stay = apps.get_model('batches', 'BatchRoomStay')
    Room = apps.get_model('farms', 'RearingRoom')
    Device = apps.get_model('sensors', 'IoTDevice')
    Reading = apps.get_model('sensors', 'SensorReading')

    for batch in Batch.objects.filter(sensor_readings__room__isnull=True).distinct():
        room_id = batch.room_id
        if room_id is None:
            last = Stay.objects.filter(batch=batch).order_by('-started_at').first()
            room_id = last.room_id if last else None
        if room_id is not None:
            Reading.objects.filter(batch=batch, room__isnull=True).update(room_id=room_id)

    for device in Device.objects.filter(room__isnull=True):
        room_id = None
        if device.batch_id:
            room_id = Batch.objects.filter(pk=device.batch_id).values_list('room_id', flat=True).first()
        if room_id is None and device.farm_id:
            first = Room.objects.filter(farm_id=device.farm_id, is_active=True).order_by('created_at').first()
            room_id = first.pk if first else None
        if room_id is not None:
            Device.objects.filter(pk=device.pk).update(room_id=room_id)
