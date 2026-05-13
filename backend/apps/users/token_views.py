# apps/users/token_views.py
from rest_framework import status
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.exceptions import AuthenticationFailed
from apps.audit.utils import log_action
from apps.audit.models import AuditLog

class CustomTokenObtainPairView(TokenObtainPairView):
    """
    Custom token view that logs successful and failed login attempts,
    and returns a friendly error message on failure.
    """
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)

        try:
            # validator raises AuthenticationFailed if credentials are wrong
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed as e:
            # Log the failed attempt with the tried phone number
            log_action(
                shop=None,
                user=None,
                action=AuditLog.ActionType.LOGIN_FAILED,
                details={
                    'status': 'failed',
                    'phone': request.data.get('phone', 'unknown'),
                },
                request=request,
            )
            return Response(
                {'detail': 'Phone number or password is incorrect.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Success – user is valid, log the login
        user = serializer.user
        log_action(
            shop=user.shop,
            user=user,
            action=AuditLog.ActionType.LOGIN,
            details={},
            request=request,
        )
        return Response(serializer.validated_data, status=status.HTTP_200_OK)