# Live alerts stream over an async connection, so run the API with uvicorn.
# Django's runserver cannot stream them.
dev-api:
	venv/Scripts/python -m uvicorn ssms_django.asgi:application --reload --port 8000

test:
	venv/Scripts/python -m pytest -q
