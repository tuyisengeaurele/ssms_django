"""A farm's location line is made from its place and street, whoever saves it.

The form already built the line from the places the farmer chose. A script, the shell or a later screen that set the codes
without the text could leave the two saying different things, so the model builds the line itself when the farm has a place.
A farm from before places has no codes, and its own text stays.
"""
import pytest

from farms.models import Farm
from locations import registry
from tests.factories import FarmFactory, UserFactory

pytestmark = pytest.mark.django_db


def a_village():
    """The five codes of a real village and the line they describe."""
    village = next(p for p in registry.walk() if p['level'] == 'village')
    found = registry.chain(village['code'])
    codes = {f'{level}_code': found[level]['code'] for level in ('province', 'district', 'sector', 'cell', 'village')}
    return codes, found


def test_a_farm_with_a_place_shows_the_line_made_from_it_whatever_text_was_given():
    codes, found = a_village()
    farm = Farm.objects.create(name='F', location='something else', owner=UserFactory(), street='Near the school', **codes)
    farm.refresh_from_db()
    assert farm.location == registry.describe(found, 'Near the school')


def test_changing_the_street_changes_the_line():
    codes, found = a_village()
    farm = Farm.objects.create(name='F', location='x', owner=UserFactory(), **codes)
    farm.street = 'Road 5'
    farm.save()
    farm.refresh_from_db()
    assert farm.location == registry.describe(found, 'Road 5')


def test_saving_only_the_street_still_saves_the_new_line():
    codes, found = a_village()
    farm = Farm.objects.create(name='F', location='x', owner=UserFactory(), **codes)
    farm.street = 'Road 6'
    farm.save(update_fields=['street'])
    assert Farm.objects.get(pk=farm.pk).location == registry.describe(found, 'Road 6')


def test_a_farm_from_before_places_keeps_its_own_text():
    farm = FarmFactory(location='Gatsibo, near the lake')
    farm.name = 'Renamed'
    farm.save()
    farm.refresh_from_db()
    assert farm.location == 'Gatsibo, near the lake'


def test_a_code_the_list_does_not_know_leaves_the_text_alone_and_does_not_fail():
    farm = Farm.objects.create(name='F', location='Kept', owner=UserFactory(), village_code='nope')
    farm.refresh_from_db()
    assert farm.location == 'Kept'
