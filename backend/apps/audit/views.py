from rest_framework import generics, permissions, filters
from rest_framework.pagination import PageNumberPagination
from .models import AuditLog
from .serializers import AuditLogSerializer

class AuditLogPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200

class AuditLogListView(generics.ListAPIView):
    serializer_class = AuditLogSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = AuditLogPagination
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    ordering_fields = ['created_at', 'action']
    ordering = ['-created_at']
    search_fields = ['user__phone', 'details', 'summary']   # <-- added summary

    def get_queryset(self):
        user = self.request.user
        if user.role != 'OWNER':
            return AuditLog.objects.none()

        qs = AuditLog.objects.filter(shop=user.shop)

        # Manual filters (no external packages)
        action = self.request.query_params.get('action')
        if action:
            qs = qs.filter(action=action)

        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(created_at__date__gte=start_date)
        if end_date:
            qs = qs.filter(created_at__date__lte=end_date)

        user_id = self.request.query_params.get('user_id')
        if user_id:
            qs = qs.filter(user_id=user_id)

        return qs