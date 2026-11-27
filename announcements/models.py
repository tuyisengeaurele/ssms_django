"""Announcements: short notices the SSMS team shows as a banner, to everybody signed in and, if ticked, to visitors."""
from django.conf import settings
from django.db import models

TEXT_LIMIT = 200


class AnnouncementQuerySet(models.QuerySet):
    def showing(self, now):
        """What is up at `now`, the most pressing first. The first moment counts and the last does not."""
        # By how pressing the type is. Their names happen to sort the other way round, and a new one need not.
        rank = models.Case(
            *(models.When(kind=kind, then=models.Value(place)) for place, kind in enumerate(Announcement.Kind.BY_URGENCY)),
            output_field=models.IntegerField(),
        )
        return (
            self.filter(ended_at__isnull=True, show_from__lte=now, show_until__gt=now)
            .alias(rank=rank)
            .order_by('rank', '-show_from', '-pk')
        )


class Announcement(models.Model):
    class Kind:
        INFORMATION = 'information'
        MAINTENANCE = 'maintenance'
        URGENT = 'urgent'
        BY_URGENCY = (URGENT, MAINTENANCE, INFORMATION)
        CHOICES = ((INFORMATION, 'Information'), (MAINTENANCE, 'Maintenance'), (URGENT, 'Urgent'))

    kind        = models.CharField(max_length=12, choices=Kind.CHOICES)
    # One line of plain words. English is what shows when a language is missing.
    text_en     = models.CharField(max_length=TEXT_LIMIT)
    text_fr     = models.CharField(max_length=TEXT_LIMIT, blank=True, default='')
    text_rw     = models.CharField(max_length=TEXT_LIMIT, blank=True, default='')
    show_public = models.BooleanField(default=False)
    show_from   = models.DateTimeField()
    show_until  = models.DateTimeField()
    # Set by "End now". Nothing is deleted, so what was said stays on record.
    ended_at    = models.DateTimeField(null=True, blank=True)
    # Goes up when the type or the words change, so a person who closed the old one sees the new one.
    version     = models.PositiveSmallIntegerField(default=1)
    created_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    updated_by  = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+',
    )
    created_at  = models.DateTimeField(auto_now_add=True)
    updated_at  = models.DateTimeField(auto_now=True)

    objects = AnnouncementQuerySet.as_manager()

    class Meta:
        db_table = 'announcements'
        constraints = [
            models.CheckConstraint(condition=models.Q(show_until__gt=models.F('show_from')), name='announcement_ends_after_it_starts'),
        ]
        indexes = [models.Index(fields=['show_until', 'show_from'], name='announcement_window_idx')]

    def __str__(self):
        return f'{self.kind}: {self.text_en}'
