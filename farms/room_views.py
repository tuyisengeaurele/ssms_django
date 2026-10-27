"""Rearing rooms: /api/farms/<id>/rooms and /api/rooms/<id>."""
from django.db.models import OuterRef, Prefetch, Subquery
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.utils import log_action
from batches.models import Batch
from core.access import get_farm_or_404, get_room_or_404
from core.utils import api_error, api_success

from .models import RearingRoom

NAME_TAKEN = 'You already have a room with that name.'


class RoomWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)


def _live_devices():
    from sensors.models import IoTDevice

    return Prefetch('devices', queryset=IoTDevice.objects.filter(is_active=True).order_by('created_at'), to_attr='live_devices')


def _with_latest_reading(rooms):
    """Add the newest reading of each room, worked out in the same query as the rooms."""
    from sensors.models import SensorReading

    newest = SensorReading.objects.filter(room=OuterRef('pk')).order_by('-timestamp')
    return rooms.annotate(
        latest_temperature=Subquery(newest.values('temperature')[:1]),
        latest_humidity=Subquery(newest.values('humidity')[:1]),
        latest_at=Subquery(newest.values('timestamp')[:1]),
    )


def _live_batches():
    return Prefetch('batches', queryset=Batch.objects.filter(is_active=True).order_by('created_at'), to_attr='live_batches')


def _row(room: RearingRoom) -> dict:
    batches = getattr(room, 'live_batches', None)
    if batches is None:
        batches = list(room.batches.filter(is_active=True))
    from sensors.devices import effective_status

    devices = getattr(room, 'live_devices', None)
    if devices is None:
        devices = list(room.devices.filter(is_active=True))
    at = getattr(room, 'latest_at', None)
    return {
        'id': room.pk,
        'name': room.name,
        'notes': room.notes,
        'batch_count': len(batches),
        'batches': [{'id': b.pk, 'stage': b.stage} for b in batches],
        'devices': [
            {'id': d.pk, 'name': d.name, 'status': effective_status(d), 'last_seen': d.last_seen}
            for d in devices
        ],
        # The newest reading of any sensor in the room, or None when nothing has been measured yet.
        'latest_reading': {'temperature': room.latest_temperature, 'humidity': room.latest_humidity, 'timestamp': at} if at else None,
        'created_at': room.created_at,
    }


def _name_taken(farm, name: str, exclude_pk: str | None = None) -> bool:
    taken = RearingRoom.objects.filter(farm=farm, is_active=True, name__iexact=name)
    if exclude_pk:
        taken = taken.exclude(pk=exclude_pk)
    return taken.exists()


def _can_write(user) -> bool:
    return user.role in ('FARMER', 'ADMIN')


class FarmRoomListView(APIView):
    """GET lists the rooms of a farm with the batches in each. POST adds a room (the owner or an admin)."""
    permission_classes = [IsAuthenticated]

    def get(self, request, farm_id):
        farm = get_farm_or_404(request.user, farm_id)
        rooms = _with_latest_reading(RearingRoom.objects.filter(farm=farm, is_active=True)).prefetch_related(_live_batches(), _live_devices())
        return api_success([_row(r) for r in rooms])

    def post(self, request, farm_id):
        if not _can_write(request.user):
            return api_error("You don't have permission to do that.", 403)
        farm = get_farm_or_404(request.user, farm_id)
        serializer = RoomWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        name = serializer.validated_data['name']
        if _name_taken(farm, name):
            return api_error(NAME_TAKEN, 422, {'name': [NAME_TAKEN]})
        room = RearingRoom.objects.create(farm=farm, name=name, notes=serializer.validated_data.get('notes', ''))
        log_action(request, 'CREATE', 'Room', room.pk, f'Added room {room.name} to {farm.name}')
        return api_success(_row(room), 'Room added.', 201)


class RoomDetailView(APIView):
    """PATCH renames a room or changes its notes. DELETE hides it, but only when no batch is in it."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not _can_write(request.user):
            return api_error("You don't have permission to do that.", 403)
        room = get_room_or_404(request.user, pk)
        serializer = RoomWriteSerializer(data={'name': room.name, **request.data}, partial=False)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        name = serializer.validated_data['name']
        if _name_taken(room.farm, name, exclude_pk=room.pk):
            return api_error(NAME_TAKEN, 422, {'name': [NAME_TAKEN]})
        room.name = name
        if 'notes' in serializer.validated_data:
            room.notes = serializer.validated_data['notes']
        room.save(update_fields=['name', 'notes'])
        log_action(request, 'UPDATE', 'Room', room.pk, f'Changed room {room.name}')
        return api_success(_row(room), 'Room updated.')

    def delete(self, request, pk):
        if not _can_write(request.user):
            return api_error("You don't have permission to do that.", 403)
        room = get_room_or_404(request.user, pk)
        if room.batches.filter(is_active=True).exists():
            return api_error('Move the batches out of this room first.', 409)
        room.is_active = False
        room.save(update_fields=['is_active'])
        log_action(request, 'DELETE', 'Room', room.pk, f'Deleted room {room.name}')
        return api_success(None, 'Room deleted.')
