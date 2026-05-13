from rest_framework import serializers
from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    user_display = serializers.SerializerMethodField()
    action_display = serializers.CharField(source='get_action_display', read_only=True)
    summary = serializers.CharField(read_only=True)
    ip_address = serializers.CharField(read_only=True, allow_blank=True, allow_null=True)

    class Meta:
        model = AuditLog
        fields = [
            'id', 'action', 'action_display', 'summary', 'details',
            'ip_address', 'user_agent', 'request_path', 'http_method',
            'created_at', 'user_display'
        ]
        read_only_fields = fields

    def get_user_display(self, obj):
        if obj.user:
            return f"{obj.user.phone} ({obj.user.role})"
        return "System"