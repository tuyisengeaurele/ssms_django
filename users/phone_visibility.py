"""Who may see whose phone number.

* The person sees their own, and the SSMS team sees every number.
* A supervisor sees the farmers who are in their cooperative now: the ones with an open membership there, the same rule that
  decides which farms a supervisor sees (core/access.py). A farmer who left stops being visible at once.
* A farmer sees the supervisors of their own cooperative, so they can call for help, and never another farmer.
* Nobody else sees any number.

Every payload that shows another person asks this module, and leaves the `phone` key out when the answer is no.
"""
from cooperatives.models import CooperativeMembership

from .models import Role, User


def visible_phone_ids(viewer, target_ids) -> set:
    """Which of these people's numbers the viewer may see. One query at most, however long the list is."""
    ids = {str(i) for i in target_ids}
    if viewer.role == Role.ADMIN:
        return ids
    seen = ids & {str(viewer.pk)}
    if not viewer.cooperative_id or not ids - seen:
        return seen
    if viewer.role == Role.SUPERVISOR:
        seen |= {str(i) for i in CooperativeMembership.objects.filter(
            cooperative_id=viewer.cooperative_id, ended_at__isnull=True, user_id__in=ids, user__role=Role.FARMER,
        ).values_list('user_id', flat=True)}
    elif viewer.role == Role.FARMER:
        seen |= {str(i) for i in User.objects.filter(
            pk__in=ids, role=Role.SUPERVISOR, cooperative_id=viewer.cooperative_id, is_active=True,
        ).values_list('pk', flat=True)}
    return seen


def can_see_phone(viewer, target) -> bool:
    return str(target.pk) in visible_phone_ids(viewer, [target.pk])


def person_row(viewer, person, visible, **row) -> dict:
    """{id, name, email, ...} for a person, with their number only when `visible` (from visible_phone_ids) holds them."""
    out = {'id': person.pk, 'name': person.name, 'email': person.email, **row}
    if str(person.pk) in visible and person.phone:
        out['phone'] = person.phone
    return out
