from django.db import models
from core.ids import new_id as _generate_id  # migrations import this name


class Cooperative(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    name = models.CharField(max_length=150, unique=True)
    description = models.TextField(blank=True, null=True)
    location = models.CharField(max_length=250, blank=True, null=True)
    is_active = models.BooleanField(db_column='isActive', default=True)
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedAt', auto_now=True)

    class Meta:
        db_table = 'cooperatives'
        ordering = ['name']

    def __str__(self):
        return self.name
