from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from core.utils import api_error, api_success

from . import registry


class PlaceListView(APIView):
    """GET /api/locations?parent=<code>, the places directly under a place. No parent gives the provinces."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        rows = registry.children(request.query_params.get('parent') or None)
        if rows is None:
            return api_error("We couldn't find that place.", 404)
        return api_success(rows)


class LocateView(APIView):
    """POST /api/locations/locate with {lat, lng}, the province, district and sector a point is in.

    The point is only looked up and never stored. It travels in the body and not in the address, so it does not end
    up in the access logs of a proxy."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            found = registry.locate(request.data.get('lat'), request.data.get('lng'))
        except ValueError:
            return api_error('Please send a valid latitude and longitude.', 422)
        if found is None:
            return api_error('That spot is not inside a Rwanda sector.', 404)
        return api_success(found)
