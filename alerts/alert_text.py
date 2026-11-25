"""The sentence of an alert, made from its code and values in the language of the reader.

The words are the same as the web's (`frontend/src/i18n/pages.ts`, keys starting with "alc"); a test compares them, so the
server and the page cannot drift apart. French and Kinyarwanda are drafts until a native speaker has read them, like every
other text in those languages.
"""
import re

# The code is stored on the alert, so a code is never renamed or reused for another meaning.
TEXTS = {
    'temperature_low': {
        'en': 'Temperature too low: {value} °C (min {min} °C). Check heating.',
        'fr': 'Température trop basse : {value} °C (min {min} °C). Vérifiez le chauffage.',
        'rw': 'Ubushyuhe buri hasi: {value} °C (ntarengwa {min} °C). Reba uburyo bwo gushyushya.',
    },
    'temperature_high': {
        'en': 'Temperature too high: {value} °C (max {max} °C). Improve ventilation.',
        'fr': 'Température trop élevée : {value} °C (max {max} °C). Aérez davantage.',
        'rw': 'Ubushyuhe buri hejuru: {value} °C (ntarengwa {max} °C). Ongera umwuka mu cyumba.',
    },
    'humidity_low': {
        'en': 'Humidity too low: {value}% (min {min}%). Add moisture.',
        'fr': "Humidité trop basse : {value} % (min {min} %). Ajoutez de l'humidité.",
        'rw': 'Ubuhehere buri hasi: {value}% (ntarengwa {min}%). Ongeramo ubuhehere.',
    },
    'humidity_high': {
        'en': 'Humidity too high: {value}% (max {max}%). Improve air flow.',
        'fr': 'Humidité trop élevée : {value} % (max {max} %). Aérez davantage.',
        'rw': 'Ubuhehere buri hejuru: {value}% (ntarengwa {max}%). Ongera umwuka.',
    },
    'disease_suspected': {
        'en': '{disease} suspected in this batch ({confidence}%). Check it and tell your supervisor.',
        'fr': '{disease} suspectée dans ce lot ({confidence} %). Vérifiez-le et prévenez votre superviseur.',
        'rw': 'Hakekwa {disease} muri iri tsinda ({confidence}%). Rirebe ubwire umugenzuzi wawe.',
    },
    'stage_changed': {
        'en': 'Batch stage updated to {stage}.',
        'fr': 'Le stade du lot est passé à {stage}.',
        'rw': "Icyiciro cy'itsinda cyahindutse kiba {stage}.",
    },
    'device_offline': {
        'en': 'Device {device} sent no data for {minutes} minutes. Check power and connection.',
        'fr': "L'appareil {device} n'a rien envoyé depuis {minutes} minutes. Vérifiez l'alimentation et la connexion.",
        'rw': "Igikoresho {device} nticyohereje amakuru mu minota {minutes}. Reba amashanyarazi n'umuyoboro.",
    },
}

CODES = tuple(TEXTS)

# The five stages, as the web names them.
STAGE_NAMES = {
    'EGG': {'en': 'Egg', 'fr': 'Œuf', 'rw': 'Igi'},
    'LARVA': {'en': 'Larva', 'fr': 'Larve', 'rw': 'Larva'},
    'PUPA': {'en': 'Pupa', 'fr': 'Pupe', 'rw': 'Pupa'},
    'COCOON': {'en': 'Cocoon', 'fr': 'Cocon', 'rw': 'Igishishwa'},
    'HARVEST': {'en': 'Harvest', 'fr': 'Récolte', 'rw': 'Isarura'},
}

_PLACE = re.compile(r'\{(\w+)\}')


def render_alert(code, params, lang='en', fallback='') -> str:
    """The sentence for a code. An unknown or missing code gives `fallback` (the stored message), an unknown language gives
    English, and a value that is missing leaves its {place} in the text rather than failing."""
    texts = TEXTS.get(code)
    if texts is None:
        return fallback
    lang = lang if lang in texts else 'en'
    values = dict(params or {})
    stage = values.get('stage')
    if stage in STAGE_NAMES:
        values['stage'] = STAGE_NAMES[stage][lang]
    return _PLACE.sub(lambda m: str(values[m.group(1)]) if m.group(1) in values else m.group(0), texts[lang])
