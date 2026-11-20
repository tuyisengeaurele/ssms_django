"""The sentence of an alert, made from its code and values in the language of the reader.

The words are the same as the web's (`frontend/src/i18n/pages.ts`, keys starting with "alc"); a test compares them, so the
server and the page cannot drift apart. French and Kinyarwanda are drafts until a native speaker has read them, like every
other text in those languages.
"""
import re

# The code is stored on the alert, so a code is never renamed or reused for another meaning.
TEXTS = {
    'temperature_low': {
        'en': 'Temperature too low: {value} °C (safe min is {min} °C). Check heating.',
        'fr': 'Température trop basse : {value} °C (minimum sûr : {min} °C). Vérifiez le chauffage.',
        'rw': "Ubushyuhe buri hasi cyane: {value} °C (urugero rwiza rwo hasi ni {min} °C). Genzura uburyo bwo gushyushya.",
    },
    'temperature_high': {
        'en': 'Temperature too high: {value} °C (safe max is {max} °C). Improve ventilation.',
        'fr': 'Température trop élevée : {value} °C (maximum sûr : {max} °C). Améliorez la ventilation.',
        'rw': "Ubushyuhe buri hejuru cyane: {value} °C (urugero rwiza rwo hejuru ni {max} °C). Ongera umwuka uhinduka mu cyumba.",
    },
    'humidity_low': {
        'en': 'Humidity too low: {value}% (safe min is {min}%). Add moisture.',
        'fr': "Humidité trop basse : {value} % (minimum sûr : {min} %). Ajoutez de l'humidité.",
        'rw': "Ubuhehere buri hasi cyane: {value}% (urugero rwiza rwo hasi ni {min}%). Ongeramo ubuhehere.",
    },
    'humidity_high': {
        'en': 'Humidity too high: {value}% (safe max is {max}%). Improve air circulation.',
        'fr': "Humidité trop élevée : {value} % (maximum sûr : {max} %). Améliorez la circulation de l'air.",
        'rw': "Ubuhehere buri hejuru cyane: {value}% (urugero rwiza rwo hejuru ni {max}%). Ongera umwuka uhinduka mu cyumba.",
    },
    'disease_suspected': {
        'en': '{disease} suspected in this batch ({confidence}% confidence). Check the batch and ask your supervisor to take a look.',
        'fr': "{disease} suspectée dans ce lot ({confidence} % de confiance). Vérifiez le lot et demandez à votre superviseur de l'examiner.",
        'rw': "Hakekwa ko {disease} iri muri iri tsinda (icyizere {confidence}%). Reba itsinda unasabe umugenzuzi wawe kuryirebera.",
    },
    'stage_changed': {
        'en': 'Batch stage updated to {stage}.',
        'fr': 'Le stade du lot est passé à {stage}.',
        'rw': "Icyiciro cy'itsinda cyahindutse kiba {stage}.",
    },
    'device_offline': {
        'en': 'Device {device} has not sent data for {minutes} minutes. Check its power and connection.',
        'fr': "L'appareil {device} n'a pas envoyé de données depuis {minutes} minutes. Vérifiez son alimentation et sa connexion.",
        'rw': "Igikoresho {device} nticyohereje amakuru mu minota {minutes}. Genzura amashanyarazi n'umuyoboro wacyo.",
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
