from django.db import migrations


def room_from_batch(apps, schema_editor):
    """A device that was never placed in a room takes the room its batch is in, so dropping the batch link loses nothing.

    sensors 0004 did this once, and a device made since has named a room or a farm, never a batch. This is a second pass for any
    device that slipped through, and it changes nothing when every device already has a room.
    """
    Device = apps.get_model('sensors', 'IoTDevice')
    Batch = apps.get_model('batches', 'Batch')
    for device in Device.objects.filter(room__isnull=True, batch__isnull=False):
        room_id = Batch.objects.filter(pk=device.batch_id).values_list('room_id', flat=True).first()
        if room_id:
            Device.objects.filter(pk=device.pk).update(room_id=room_id)


class Migration(migrations.Migration):
    """Data only. The column goes in the next migration: Postgres will not alter a table in the transaction that just updated its rows."""

    dependencies = [('sensors', '0009_data_constraints')]

    operations = [migrations.RunPython(room_from_batch, migrations.RunPython.noop)]
