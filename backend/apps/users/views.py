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

# ✅ Import subscription permission
from apps.subscriptions.permissions import MaxUsersPermission


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


class ForgotPasswordView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'detail': 'Email is required.'}, status=400)

        try:
            user = User.objects.get(email=email, is_active=True)
        except User.DoesNotExist:
            return Response({'detail': 'If an account with that email exists, a reset link has been sent.'})

        token_generator = PasswordResetTokenGenerator()
        token = token_generator.make_token(user)
        uid = urlsafe_base64_encode(force_bytes(user.pk))

        reset_url = f"{settings.FRONTEND_URL}/reset-password/{uid}/{token}/"

        send_mail(
            subject="SmartPOS – Reset your password",
            message=(
                f"Hi {user.phone},\n\n"
                f"Use the link below to reset your password:\n{reset_url}\n\n"
                f"This link expires in 24 hours."
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[email],
            fail_silently=False,
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