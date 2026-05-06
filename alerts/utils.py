"""
Alert rule engine — called after every sensor reading (API or simulator).

Safe ranges for silkworm farming:
  Temperature : 22.0 – 28.0 °C
  Humidity    : 70.0 – 85.0 %
"""

from .models import AlertLog

TEMP_MIN = 22.0
TEMP_MAX = 28.0
HUM_MIN  = 70.0
HUM_MAX  = 85.0


def check_sensor_alerts(batch_id: str, temperature: float, humidity: float) -> list:
    """
    Inspect a single sensor reading. If either value is out of safe range,
    create and persist AlertLog records. Returns the list of created alerts.
    """
    to_create = []

    if temperature < TEMP_MIN:
        to_create.append(AlertLog(
            batch_id=batch_id,
            type='TEMPERATURE',
            message=(
                f'Temperature too low: {temperature} C '
                f'(safe min is {TEMP_MIN} C). Check heating.'
            ),
        ))
    elif temperature > TEMP_MAX:
        to_create.append(AlertLog(
            batch_id=batch_id,
            type='TEMPERATURE',
            message=(
                f'Temperature too high: {temperature} C '
                f'(safe max is {TEMP_MAX} C). Improve ventilation.'
            ),
        ))

    if humidity < HUM_MIN:
        to_create.append(AlertLog(
            batch_id=batch_id,
            type='HUMIDITY',
            message=(
                f'Humidity too low: {humidity}% '
                f'(safe min is {HUM_MIN}%). Add moisture.'
            ),
        ))
    elif humidity > HUM_MAX:
        to_create.append(AlertLog(
            batch_id=batch_id,
            type='HUMIDITY',
            message=(
                f'Humidity too high: {humidity}% '
                f'(safe max is {HUM_MAX}%). Improve air circulation.'
            ),
        ))

    if to_create:
        AlertLog.objects.bulk_create(to_create)

    return to_create
