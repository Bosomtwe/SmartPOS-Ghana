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
    Also blocks login if the shop is inactive (unless superuser).
    """
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)

        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed as e:
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

        user = serializer.user

        # ✅ Check if the shop is inactive (and user is not superuser)
        if user.shop and not user.shop.is_active and not user.is_superuser:
            log_action(
                shop=user.shop,
                user=user,
                action=AuditLog.ActionType.LOGIN_FAILED,
                details={'status': 'failed', 'reason': 'shop_inactive'},
                request=request,
            )
            return Response(
                {'detail': 'Your shop has been deactivated. Please contact support.'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # Success – user is valid, log the login
        log_action(
            shop=user.shop,
            user=user,
            action=AuditLog.ActionType.LOGIN,
            details={},
            request=request,
        )
        return Response(serializer.validated_data, status=status.HTTP_200_OK)