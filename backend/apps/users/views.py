# apps/users/views.py
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Shop, User
from .serializers import RegisterSerializer, UserSerializer, ShopSerializer
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.hashers import make_password
from django.shortcuts import get_object_or_404
from django.core.paginator import Paginator
import random
import string
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth.tokens import PasswordResetTokenGenerator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.db import transaction
import logging
from django.utils.crypto import get_random_string

# ✅ Import subscription permission
from apps.subscriptions.permissions import MaxUsersPermission

logger = logging.getLogger(__name__)

# ================ SUPERUSER PERMISSION ================
class IsSuperUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_superuser


class RegisterView(generics.CreateAPIView):
    permission_classes = [permissions.AllowAny]
    serializer_class = RegisterSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        if User.objects.filter(phone=data['phone']).exists():
            return Response(
                {"detail": {"phone": ["A user with this phone number already exists."]}},
                status=status.HTTP_400_BAD_REQUEST
            )

        shop = Shop.objects.create(
            name=data['shop_name'],
            address=data.get('address', '')
        )

        email = data.get('email')
        user = User.objects.create_user(
            phone=data['phone'],
            password=data['password'],
            shop=shop,
            role='OWNER',
            is_active=True,
            email=email
        )
        shop.owner = user
        shop.save()

        refresh = RefreshToken.for_user(user)
        return Response({
            'refresh': str(refresh),
            'access': str(refresh.access_token),
            'user': UserSerializer(user).data,
            'shop': ShopSerializer(shop).data,
        }, status=status.HTTP_201_CREATED)


class UserDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user


class ShopDetailView(generics.RetrieveUpdateAPIView):
    serializer_class = ShopSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user.shop


# ✅ Apply MaxUsersPermission to cashier creation
class CreateCashierView(APIView):
    permission_classes = [IsAuthenticated, MaxUsersPermission]

    def post(self, request):
        shop = request.user.shop
        phone = request.data.get('phone')
        password = request.data.get('password')

        if not phone or not password:
            return Response({'error': 'Phone and password required'}, status=400)

        if User.objects.filter(phone=phone, shop=shop).exists():
            return Response({'error': 'User already exists in this shop'}, status=400)

        user = User.objects.create(
            phone=phone,
            password=make_password(password),
            role='CASHIER',
            shop=shop,
            is_active=True
        )
        return Response({'message': 'Cashier created', 'phone': user.phone})


class ListCashiersView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if request.user.role != 'OWNER':
            return Response({'error': 'Only the owner can see cashiers'}, status=403)

        queryset = User.objects.filter(
            shop=request.user.shop, role='CASHIER'
        ).order_by('-is_active', 'phone')

        search = request.query_params.get('search', '')
        if search:
            queryset = queryset.filter(phone__icontains=search)

        page = int(request.query_params.get('page', 1))
        page_size = int(request.query_params.get('page_size', 50))
        paginator = Paginator(queryset, page_size)
        page_obj = paginator.get_page(page)

        data = {
            'count': paginator.count,
            'next': page_obj.has_next(),
            'previous': page_obj.has_previous(),
            'results': [
                {'id': user.id, 'phone': user.phone, 'is_active': user.is_active}
                for user in page_obj.object_list
            ],
        }
        return Response(data)


class ResetCashierPasswordView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if request.user.role != 'OWNER':
            return Response({'error': 'Only the owner can reset passwords'}, status=403)

        cashier = get_object_or_404(
            User, id=user_id, shop=request.user.shop, role='CASHIER'
        )

        new_password = ''.join(random.choices(string.ascii_letters + string.digits, k=8))
        cashier.password = make_password(new_password)
        cashier.save()

        return Response({
            'message': 'Password reset successfully',
            'user_id': cashier.id,
            'phone': cashier.phone,
            'new_password': new_password
        })


# ==================== IMPROVED FORGOT PASSWORD VIEW ====================
class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'detail': 'Email is required.'}, status=400)

        try:
            user = User.objects.get(email=email, is_active=True)
        except User.DoesNotExist:
            # Always return the same message for security
            return Response({'detail': 'If an account with that email exists, a reset link has been sent.'})

        if not user.email:
            return Response({'detail': 'If an account with that email exists, a reset link has been sent.'})

        token_generator = PasswordResetTokenGenerator()
        token = token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        reset_url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}/"

        html_message = f"""
        <p>Hi {user.phone},</p>
        <p>Use the link below to reset your password:</p>
        <p><a href="{reset_url}">{reset_url}</a></p>
        <p>This link expires in 24 hours.</p>
        <p>If you did not request this, please ignore this email.</p>
        """

        try:
            send_mail(
                subject="SmartPOS – Reset your password",
                message="",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
                html_message=html_message,
            )
            logger.info(f"Password reset email sent to {user.email}")
        except Exception as e:
            logger.error(f"Failed to send reset email: {str(e)}")
            # ✅ User‑friendly error – no technical details
            return Response(
                {'detail': 'Unable to send reset email at this time. Please contact support or try again later.'},
                status=500
            )

        return Response({'detail': 'If an account with that email exists, a reset link has been sent.'})


class ResetPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, uidb64, token):
        new_password = request.data.get('new_password')
        if not new_password:
            return Response({'detail': 'New password is required.'}, status=400)

        try:
            uid = force_str(urlsafe_base64_decode(uidb64))
            user = User.objects.get(pk=uid)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response({'detail': 'Invalid reset link.'}, status=400)

        token_generator = PasswordResetTokenGenerator()
        if not token_generator.check_token(user, token):
            return Response({'detail': 'Invalid or expired token.'}, status=400)

        user.set_password(new_password)
        user.save()
        return Response({'detail': 'Password has been reset successfully.'})


class DeactivateCashierView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if request.user.role != 'OWNER':
            return Response({'error': 'Only the owner can deactivate cashiers'}, status=403)

        cashier = get_object_or_404(
            User, id=user_id, shop=request.user.shop, role='CASHIER'
        )
        if not cashier.is_active:
            return Response({'error': 'Cashier is already deactivated'}, status=400)

        cashier.is_active = False
        cashier.save()
        return Response({'message': 'Cashier deactivated', 'is_active': False})


class ReactivateCashierView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, user_id):
        if request.user.role != 'OWNER':
            return Response({'error': 'Only the owner can reactivate cashiers'}, status=403)

        cashier = get_object_or_404(
            User, id=user_id, shop=request.user.shop, role='CASHIER'
        )
        if cashier.is_active:
            return Response({'error': 'Cashier is already active'}, status=400)

        cashier.is_active = True
        cashier.save()
        return Response({'message': 'Cashier reactivated', 'is_active': True})


# ==================== ADMIN SHOP MANAGEMENT ====================
class AdminShopListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsSuperUser]
    serializer_class = ShopSerializer
    queryset = Shop.objects.all().order_by('name')


class AdminShopUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsSuperUser]

    def patch(self, request, shop_id):
        is_active = request.data.get('is_active')
        if is_active is None:
            return Response({'error': 'is_active field required'}, status=400)

        from .models import set_admin_override, clear_admin_override

        logger.info(f"[PATCH] Received is_active={is_active} for shop {shop_id}")

        set_admin_override(True)
        try:
            shop = get_object_or_404(Shop, id=shop_id)
            old_value = shop.is_active
            logger.info(f"[PATCH] Current DB value: is_active={old_value}, skip_auto_reactivation={shop.skip_auto_reactivation}")

            shop.is_active = is_active
            shop.save(update_fields=['is_active', 'skip_auto_reactivation'])
            logger.info(f"[PATCH] Saved → is_active={shop.is_active}")

            # Force fresh read from database
            shop.refresh_from_db()
            logger.info(f"[PATCH] After refresh_from_db: is_active={shop.is_active}")
        finally:
            clear_admin_override()

        # Optional audit logging
        try:
            from apps.audit.utils import log_action
            from apps.audit.models import AuditLog
            log_action(
                shop=shop,
                user=request.user,
                action='SHOP_STATUS_CHANGE',
                details={'shop_id': str(shop.id), 'is_active': shop.is_active},
                request=request
            )
        except Exception as e:
            logger.error(f"Audit log failed: {e}")

        return Response({'id': str(shop.id), 'is_active': shop.is_active})


# ==================== ADMIN PASSWORD RESET ====================
class AdminResetUserPasswordView(APIView):
    permission_classes = [IsAuthenticated, IsSuperUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=404)

        new_password = request.data.get('new_password')
        if not new_password:
            new_password = get_random_string(length=10)
        user.set_password(new_password)
        user.save()

        try:
            from apps.audit.utils import log_action
            from apps.audit.models import AuditLog
            log_action(
                shop=user.shop,
                user=request.user,
                action='ADMIN_RESET_PASSWORD',
                details={'target_user_id': str(user.id), 'target_phone': user.phone},
                request=request
            )
        except Exception as e:
            logger.error(f"Audit log failed: {e}")

        return Response({
            'message': 'Password reset successfully',
            'user_id': str(user.id),
            'phone': user.phone,
            'new_password': new_password
        })


# ==================== IMPROVED ADMIN SEND RESET LINK ====================
class AdminSendResetLinkView(APIView):
    permission_classes = [IsAuthenticated, IsSuperUser]

    def post(self, request, user_id):
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=404)

        if not user.email:
            return Response(
                {'error': 'User has no email address. Please set an email first via Settings or admin panel.'},
                status=400
            )

        token_generator = PasswordResetTokenGenerator()
        token = token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        reset_url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}/"

        html_message = f"""
        <p>Hi {user.phone},</p>
        <p>A superuser has initiated a password reset for your account.</p>
        <p>Click the link below to set a new password:</p>
        <p><a href="{reset_url}">{reset_url}</a></p>
        <p>This link expires in 24 hours.</p>
        <p>If you did not request this, please ignore this email.</p>
        """

        email_sent = False
        try:
            send_mail(
                subject="SmartPOS – Password Reset Request",
                message="",
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[user.email],
                fail_silently=False,
                html_message=html_message,
            )
            logger.info(f"Password reset link sent to {user.email} by superuser {request.user.id}")
            email_sent = True
        except Exception as e:
            logger.error(f"Failed to send reset email: {str(e)}")
            # Still return the link so superuser can copy it manually

        return Response({
            'message': f'Password reset link {"sent to " + user.email if email_sent else "generated (email failed – copy the link below)"}',
            'reset_url': reset_url,
            'email_sent': email_sent
        })