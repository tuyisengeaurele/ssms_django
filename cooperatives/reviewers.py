"""Who decides about a farmer: the active supervisors of the farmer's cooperative, else every active admin."""
from users.models import Role, User


def reviewers_of(farmer) -> list:
    if farmer.cooperative_id:
        supervisors = list(User.objects.filter(role=Role.SUPERVISOR, cooperative_id=farmer.cooperative_id, is_active=True))
        if supervisors:
            return supervisors
    return list(User.objects.filter(role=Role.ADMIN, is_active=True))
