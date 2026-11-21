from django.db import migrations


class Migration(migrations.Migration):
    """Drop iot_devices.batchId. A device belongs to a farm and measures a room, and every batch in the room shares that air."""

    dependencies = [('sensors', '0010_devices_take_the_room_of_their_batch')]

    operations = [migrations.RemoveField(model_name='iotdevice', name='batch')]
