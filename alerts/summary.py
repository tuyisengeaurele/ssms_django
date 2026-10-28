"""What every alert list needs to say who acknowledged an alert and how many comments it has, in the same query."""
from django.db.models import Count, IntegerField, OuterRef, Subquery
from django.db.models.functions import Coalesce

from .models import AlertComment


def with_comment_summary(qs):
    """Add the acknowledging person and `comment_count` (live comments only) to an alert queryset."""
    live = (
        AlertComment.objects.filter(alert=OuterRef('pk'), is_active=True)
        .order_by().values('alert').annotate(n=Count('pk')).values('n')
    )
    return qs.select_related('acknowledged_by').annotate(comment_count=Coalesce(Subquery(live, output_field=IntegerField()), 0))
