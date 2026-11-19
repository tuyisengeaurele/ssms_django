"""The cooperative report on screen is kept for a minute.

Opening the report asks the database about 16 questions, and each is a round trip to a database in another country. A supervisor
who opens it, changes the period and goes back, or a few people looking at the same cooperative, make the same report again and
again. It is kept per cooperative, period and kind of reader (an admin and a supervisor are told apart in the key, so nothing one
may see is served to the other), in memory (settings.CACHES['reports']).

A download is not kept: a CSV or a PDF is a document that is passed around, and its "generated at" should be true.
"""
from django.core.cache import caches

REPORT_SECONDS = 60


def kept_report(user, cooperative, start, end, make):
    """The report for this cooperative and period, made by `make()` unless one was made in the last minute."""
    cache = caches['reports']
    key = f'coop-report:{user.role}:{cooperative.pk if cooperative else "all"}:{start}:{end}'
    found = cache.get(key)
    if found is not None:
        return found
    report = make()
    cache.set(key, report, REPORT_SECONDS)
    return report
