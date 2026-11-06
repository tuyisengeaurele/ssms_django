"""Rearing rooms: /api/farms/<id>/rooms and /api/rooms/<id>."""
from django.db.models import OuterRef, Prefetch, Subquery
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from audit_log.changes import build_changes, snapshot
from audit_log.utils import log_action, on_behalf_of
from batches.models import Batch
from core.access import get_farm_or_404, get_room_or_404
from core.permissions import RolePermission
from core.utils import api_error, api_success

from . import room_notify, room_review
from .models import AREA_MAX, AREA_MIN, RearingRoom
from .room_review import ReviewError

NAME_TAKEN = 'You already have a room with that name.'
NEEDS_SIZE = 'Please give the size of the room in square metres.'


class RoomWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=100)
    notes = serializers.CharField(max_length=500, required=False, allow_blank=True)
    area_m2 = serializers.DecimalField(
        max_digits=7, decimal_places=2, min_value=AREA_MIN, max_value=AREA_MAX, required=False,
        error_messages={
            'invalid': 'Please enter the size as a number of square metres.',
            'min_value': 'A room must be at least 1 square metre.',
            'max_value': f'A room can be {AREA_MAX:.0f} square metres at most.',
            'max_decimal_places': 'Please use at most two decimal places.',
            'max_whole_digits': f'A room can be {AREA_MAX:.0f} square metres at most.',
        },
    )


def _body(request) -> dict:
    """The request body with the size under one name. The camel case parser turns `areaM2` into `area_m_2`, because it
    splits before a digit, while the answers are sent as `areaM2`. Both spellings are read."""
    data = dict(request.data)
    for key in ('area_m_2', 'areaM2'):
        if key in data and 'area_m2' not in data:
            data['area_m2'] = data.pop(key)
    return data


def _fail(error: ReviewError):
    """The page reads `code` to tell the cases apart, as it does for the second factor and support access."""
    response = api_error(error.message, error.status)
    response.data['code'] = error.code
    return response


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
        'approval_status': room.approval_status,
        'review_note': room.review_note,
        'reviewed_at': room.reviewed_at,
        'area_m2': room.area_m2,
        'pending_area_m2': room.pending_area_m2,
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


class FarmRoomListView(APIView):
    """GET lists the rooms of a farm with the batches in each. POST adds a room (the owner or an admin)."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rooms'

    def get(self, request, farm_id):
        farm = get_farm_or_404(request.user, farm_id)
        rooms = _with_latest_reading(RearingRoom.objects.filter(farm=farm, is_active=True)).prefetch_related(_live_batches(), _live_devices())
        return api_success([_row(r) for r in rooms])

    def post(self, request, farm_id):
        farm = get_farm_or_404(request.user, farm_id)
        serializer = RoomWriteSerializer(data=_body(request))
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        name = serializer.validated_data['name']
        if _name_taken(farm, name):
            return api_error(NAME_TAKEN, 422, {'name': [NAME_TAKEN]})
        area = serializer.validated_data.get('area_m2')
        if area is None:
            return api_error('Please check what you entered and try again.', 422, {'area_m2': [NEEDS_SIZE]})
        room = RearingRoom.objects.create(farm=farm, name=name, notes=serializer.validated_data.get('notes', ''), area_m2=area)
        room_review.open_new(room, request.user)
        log_action(
            request, 'CREATE', 'Room', room.pk, f'Added room {room.name} to {farm.name} ({area} square metres, {room.approval_status})',
            owner=on_behalf_of(request, farm),
        )
        if room.approval_status == RearingRoom.Approval.PENDING:
            room_notify.tell_reviewers(room, room_notify.NEW)
        return api_success(_row(room), 'Room added.', 201)


class RoomDetailView(APIView):
    """PATCH renames a room or changes its notes. DELETE hides it, but only when no batch is in it."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rooms'

    def patch(self, request, pk):
        room = get_room_or_404(request.user, pk)
        serializer = RoomWriteSerializer(data={'name': room.name, **_body(request)}, partial=False)
        if not serializer.is_valid():
            return api_error('Please check what you entered and try again.', 422, serializer.errors)
        name = serializer.validated_data['name']
        if _name_taken(room.farm, name, exclude_pk=room.pk):
            return api_error(NAME_TAKEN, 422, {'name': [NAME_TAKEN]})
        before = snapshot(room, ['name', 'notes'])
        room.name = name
        if 'notes' in serializer.validated_data:
            room.notes = serializer.validated_data['notes']
        room.save(update_fields=['name', 'notes'])
        log_action(
            request, 'UPDATE', 'Room', room.pk, f'Changed room {room.name}', owner=on_behalf_of(request, room.farm),
            changes=build_changes(before, snapshot(room, before)),
        )
        area = serializer.validated_data.get('area_m2')
        if area is not None:
            size_in_force = room.area_m2
            outcome = room_review.change_area(room, area, request.user)
            if outcome == 'queued':
                room_notify.tell_reviewers(room, room_notify.SIZE, old_size=size_in_force)
            elif outcome == 'resubmitted':
                room_notify.tell_reviewers(room, room_notify.NEW)
            if outcome in ('queued', 'resubmitted'):
                log_action(
                    request, 'UPDATE', 'Room', room.pk, f'Asked to change the size of room {room.name} to {area} square metres',
                    owner=on_behalf_of(request, room.farm),
                )
            elif outcome == 'updated':
                log_action(request, 'UPDATE', 'Room', room.pk, f'Set the size of room {room.name} to {area} square metres', owner=on_behalf_of(request, room.farm))
        return api_success(_row(room), 'Room updated.')

    def delete(self, request, pk):
        room = get_room_or_404(request.user, pk)
        if room.batches.filter(is_active=True).exists():
            return api_error('Move the batches out of this room first.', 409)
        room.is_active = False
        room.save(update_fields=['is_active'])
        log_action(request, 'DELETE', 'Room', room.pk, f'Deleted room {room.name}', owner=on_behalf_of(request, room.farm))
        return api_success(None, 'Room deleted.')


class RoomReviewView(APIView):
    """POST /api/rooms/<id>/review with {decision: 'approve' | 'reject', note}. A rejection needs a note.

    A supervisor reaches only the rooms of their cooperative, so a room outside it is "not found", as everywhere else.
    """
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'rooms'
    actions = {'post': 'review'}

    def post(self, request, pk):
        room = get_room_or_404(request.user, pk)
        decision = request.data.get('decision')
        about_size = room.approval_status == RearingRoom.Approval.APPROVED and room.pending_area_m2 is not None
        try:
            room_review.decide(room, request.user, decision, request.data.get('note') or '')
        except ReviewError as error:
            return _fail(error)
        what = 'the new size of room' if about_size else 'room'
        if decision == 'approve':
            detail, message = f'Approved {what} {room.name}', 'Approved.'
        else:
            detail, message = f'Did not approve {what} {room.name}: {room.review_note}', 'Not approved.'
        log_action(request, 'UPDATE', 'Room', room.pk, detail, owner=on_behalf_of(request, room.farm))
        room_notify.tell_owner(room, decision, size=about_size)
        return api_success(_row(room), message)
