"""Profile photo: PATCH and DELETE /api/auth/me/photo (the person's own), and GET /api/photos/<token> (the file).

The file route needs no sign in, so a plain image tag can show it. Its address is a random token that changes with every new photo,
and only the people who may see the person are ever sent it (`users/phone_visibility.py`). The rules are in `users/photo.py`.
"""
from django.http import HttpResponse
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.renderers import JSONRenderer
from rest_framework.views import APIView

from core.permissions import RolePermission
from core.throttles import PhotoFileThrottle, PhotoUploadThrottle
from core.utils import api_error, api_success

from . import photo
from .models import UserPhoto
from .photo import PhotoError
from .serializers import UserSerializer


class PhotoView(APIView):
    """The signed in person adds, replaces or removes their own photo."""
    permission_classes = [IsAuthenticated, RolePermission]
    resource = 'account_photo'
    actions = {'patch': 'update', 'delete': 'delete'}
    parser_classes = [MultiPartParser]

    def get_throttles(self):
        throttles = super().get_throttles()
        if self.request.method == 'PATCH':
            throttles.append(PhotoUploadThrottle())
        return throttles

    def patch(self, request):
        try:
            user = photo.set_photo(request.user, request.FILES.get('photo'))
        except PhotoError as err:
            return api_error(err.message, err.status, code=err.code)
        return api_success(UserSerializer(user, context={'with_supervisor': True}).data, 'Photo saved.')

    def delete(self, request):
        try:
            user = photo.remove_photo(request.user)
        except PhotoError as err:
            return api_error(err.message, err.status, code=err.code)
        return api_success(UserSerializer(user, context={'with_supervisor': True}).data, 'Photo removed.')


class PhotoFileView(APIView):
    """GET /api/photos/<token>: the picture. A token that matches nothing is a plain 404."""
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [PhotoFileThrottle]
    renderer_classes = [JSONRenderer]

    def perform_content_negotiation(self, request, force=False):
        # An image tag asks for image types and sometimes nothing else, and the answer here is always the picture.
        return JSONRenderer(), JSONRenderer.media_type

    def get(self, request, token):
        row = UserPhoto.objects.filter(token=token).only('data', 'content_type').first()
        if row is None:
            return api_error('We could not find that photo.', 404, code='not_found')
        response = HttpResponse(bytes(row.data), content_type=row.content_type)
        response['Cache-Control'] = 'private, max-age=86400'
        response['X-Content-Type-Options'] = 'nosniff'
        return response
