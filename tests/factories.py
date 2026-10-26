"""Factories for every model the API touches. Keep them small and boring."""
from datetime import timedelta
from decimal import Decimal

import factory
from django.utils import timezone

from alerts.models import AlertLog
from batches.models import Batch
from cooperatives.models import Cooperative
from farms.models import Farm
from harvest.models import HarvestRecord
from sensors.models import DiseaseDetection, IoTDevice, SensorReading
from users.models import User


class CooperativeFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Cooperative

    name = factory.Sequence(lambda n: f'Cooperative {n}')
    location = 'Gatsibo'


class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    name = factory.Sequence(lambda n: f'User {n}')
    email = factory.Sequence(lambda n: f'user{n}@example.rw')
    role = 'FARMER'
    cooperative = None
    is_email_verified = True

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        password = kwargs.pop('password', 'Pass1234')
        return model_class.objects.create_user(password=password, **kwargs)


class FarmFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Farm

    name = factory.Sequence(lambda n: f'Farm {n}')
    location = 'Gatsibo'
    owner = factory.SubFactory(UserFactory)


class BatchFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Batch

    farm = factory.SubFactory(FarmFactory)
    stage = 'EGG'
    expected_harvest_date = factory.LazyFunction(lambda: timezone.now() + timedelta(days=30))


class SensorReadingFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = SensorReading

    batch = factory.SubFactory(BatchFactory)
    temperature = 25.0
    humidity = 78.0


class AlertLogFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = AlertLog

    batch = factory.SubFactory(BatchFactory)
    type = 'TEMPERATURE'
    message = 'Temperature too low: 21.0 C'


class DiseaseDetectionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = DiseaseDetection

    batch = factory.SubFactory(BatchFactory)
    image_url = 'https://example.invalid/test.jpg'
    result = 'Healthy'
    confidence = 0.97


class HarvestRecordFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = HarvestRecord

    batch = factory.SubFactory(BatchFactory)
    cocoon_weight_kg = Decimal('12.50')
    quality_grade = 'A'


class IoTDeviceFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = IoTDevice

    name = factory.Sequence(lambda n: f'DHT22-{n}')
    device_key = factory.Sequence(lambda n: f'ssms-test-key-{n:06d}')
    farm = factory.SubFactory(FarmFactory)
