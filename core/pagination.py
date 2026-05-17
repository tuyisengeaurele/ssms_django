from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardPagination(PageNumberPagination):
    """
    Standard page-based pagination used across all list endpoints.

    Query params:
      ?page=N        — page number (1-indexed)
      ?page_size=N   — items per page (default 20, max 100)

    Response envelope:
      {
        "success": true,
        "data": [...],
        "pagination": {
          "page": 1,
          "pageSize": 20,
          "totalItems": 87,
          "totalPages": 5,
          "hasNext": true,
          "hasPrev": false
        }
      }
    """
    page_size              = 20
    page_size_query_param  = 'page_size'
    max_page_size          = 100
    page_query_param       = 'page'

    def get_paginated_response(self, data):
        return Response({
            'success': True,
            'message': 'OK',
            'data': data,
            'pagination': {
                'page':       self.page.number,
                'pageSize':   self.get_page_size(self.request),
                'totalItems': self.page.paginator.count,
                'totalPages': self.page.paginator.num_pages,
                'hasNext':    self.get_next_link() is not None,
                'hasPrev':    self.get_previous_link() is not None,
            },
        })

    def get_paginated_response_schema(self, schema):
        return {
            'type': 'object',
            'properties': {
                'success': {'type': 'boolean'},
                'data': schema,
                'pagination': {'type': 'object'},
            },
        }
