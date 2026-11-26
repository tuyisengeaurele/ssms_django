"""Which language a contact message is written in: English, French or Kinyarwanda.

Only those three have to be told apart, so short lists of common words are enough, and nothing a visitor wrote is sent to
an outside service. A language is named only when the words settle it. Unclear text gets the fallback, and an admin sees
the language before an email goes out in it.

No word may be in two lists. Kinyarwanda joins much of its grammar onto the word, so its list is longer, and it counts the
short pieces left when an apostrophe splits a word, as in cy'ubworozi.
"""
import re

from core.language import LANGS

WORDS = {
    'en': frozenset("""
        the and is are i we you my our your to of for with have has can would like please hello hi thank thanks how what
        when where this that from about need want not do does am be it if will was they them their there here any all could
        should know get help use using been more
    """.split()),
    'fr': frozenset("""
        je nous vous le la les des un une et est sont avec pour mon ma mes notre votre bonjour merci comment quand que qui
        pas ne dans sur de du au aux ce cette ces suis avons avez veux voudrais salut il elle ils plus peux pouvez besoin
        vos nos ses leur ou mais donc être avoir faire très aussi
    """.split()),
    'rw': frozenset("""
        ni mu ku na nta kandi ariko cyangwa iki ibi uko ubu uyu aya ndashaka nshaka nashaka turashaka muraho mwaramutse
        mwiriwe murakoze amakuru neza cyane njye twe mwe wanjye yanjye banjye yacu wacu mfite dufite ese gute ryari hehe
        kuki nigute abahinzi umuhinzi umurima imirima itsinda ubworozi inyo ubudodo ubushyuhe ubuhehere bwa rya cya bya ya
        wa za ba ko kuri muri iyo buri gusa mbere nyuma ndi turi nti ntabwo iyi izi ibyo uwo aho cy bw ry kuko niba hari
        cyose byose yose bose ongera reba kugira kuba yawe wawe cyawe bwawe rwawe zawe byawe nawe kugeza kuva abo ubwo rwa
        mwa twa ibindi buryo gukora kubona kumenya ntiyashoboye umaze
    """.split()),
}

# One word is chance: a name, a borrowed word, a greeting from another language.
_LEAST = 2
_RUN_OF_LETTERS = re.compile(r'[^\W\d_]+')


def detect_language(text: str, fallback: str | None = 'en') -> str | None:
    """The language of the words, or the fallback when they do not settle it. A fallback of None is handed back as it is;
    any other that is not one of the three counts as English."""
    runs = _RUN_OF_LETTERS.findall((text or '').lower())
    score = {lang: sum(run in words for run in runs) for lang, words in WORDS.items()}
    best, second = sorted(score, key=score.get, reverse=True)[:2]
    if score[best] >= _LEAST and score[best] > score[second]:
        return best
    if fallback is None:
        return None
    return fallback if fallback in LANGS else 'en'
