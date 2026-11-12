"""Count the database queries behind one request, for tests that watch for a query per row."""
from django.db import connection
from django.test.utils import CaptureQueriesContext


def queries_for(client, path):
    """The number of queries of a GET. The first request is thrown away: it loads content types and other one time work."""
    client.get(path)
    with CaptureQueriesContext(connection) as captured:
        response = client.get(path)
    assert response.status_code == 200, (path, response.content[:200])
    return len(captured)
