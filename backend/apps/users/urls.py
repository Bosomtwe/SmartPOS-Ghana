from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from apps.users.token_views import CustomTokenObtainPairView
from .views import (
    RegisterView, UserDetailView, ShopDetailView,
    CreateCashierView, ResetCashierPasswordView, ListCashiersView,
    ForgotPasswordView, ResetPasswordView,
    DeactivateCashierView, ReactivateCashierView,
    AdminShopListView, AdminShopUpdateView   # ADD THESE
)

urlpatterns = [
    path('auth/login/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/register/', RegisterView.as_view(), name='register'),
    path('users/me/', UserDetailView.as_view(), name='user_detail'),
    path('shops/me/', ShopDetailView.as_view(), name='shop_detail'),
    path('users/cashier/', CreateCashierView.as_view(), name='create-cashier'),
    path('users/cashiers/', ListCashiersView.as_view(), name='list-cashiers'),
    path('users/cashier/<uuid:user_id>/reset_password/', ResetCashierPasswordView.as_view(), name='reset-cashier-password'),
    path('users/cashier/<uuid:user_id>/deactivate/', DeactivateCashierView.as_view(), name='deactivate-cashier'),
    path('users/cashier/<uuid:user_id>/reactivate/', ReactivateCashierView.as_view(), name='reactivate-cashier'),

    # Password reset
    path('auth/forgot-password/', ForgotPasswordView.as_view(), name='forgot_password'),
    path('auth/reset-password/<uidb64>/<token>/', ResetPasswordView.as_view(), name='reset_password'),

    # Admin shop management (superuser only)
    path('admin/shops/', AdminShopListView.as_view(), name='admin-shops-list'),
    path('admin/shops/<uuid:shop_id>/', AdminShopUpdateView.as_view(), name='admin-shop-update'),
]