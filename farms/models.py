import time
import random
import string
from django.db import models
from django.conf import settings


def _generate_id():
    ts = format(int(time.time() * 1000), 'x')
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=16))
    return f'c{ts}{rand}'


class Farm(models.Model):
    id = models.CharField(primary_key=True, max_length=36, default=_generate_id, editable=False)
    name = models.CharField(max_length=150)
    location = models.CharField(max_length=250)
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        db_column='ownerId',
        related_name='farms',
    )
    is_active = models.BooleanField(db_column='isActive', default=True)
    created_at = models.DateTimeField(db_column='createdAt', auto_now_add=True)
    updated_at = models.DateTimeField(db_column='updatedAt', auto_now=True)

    class Meta:
        db_table = 'farms'
        indexes = [
            models.Index(fields=['owner'], name='farms_owner_idx'),
        ]

    def __str__(self):
        return self.name
