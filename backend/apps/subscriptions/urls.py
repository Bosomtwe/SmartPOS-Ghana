from django.urls import path
from .views import (
    SubscriptionPlansView, CurrentSubscriptionView,
    InitializePaymentView, VerifyPaymentView, TrialActivationView,
    AdminSubscriptionListView, AdminSubscriptionUpdateView,
    AdminSubscriptionActivateView, AdminPlanListView,
    paystack_webhook   # <-- import webhook
)

urlpatterns = [
    # Public / shop endpoints
    path('subscriptions/plans/', SubscriptionPlansView.as_view(), name='subscription-plans'),
    path('subscriptions/current/', CurrentSubscriptionView.as_view(), name='current-subscription'),
    path('subscriptions/initialize/', InitializePaymentView.as_view(), name='initialize-payment'),
    path('subscriptions/verify/', VerifyPaymentView.as_view(), name='verify-payment'),
    path('subscriptions/trial/', TrialActivationView.as_view(), name='trial-activation'),

    # Paystack webhook
    path('webhook/paystack/', paystack_webhook, name='paystack-webhook'),   # <-- add this

    # Admin endpoints (superuser only)
    path('admin/subscriptions/', AdminSubscriptionListView.as_view(), name='admin-subscriptions'),
    path('admin/subscriptions/<uuid:pk>/', AdminSubscriptionUpdateView.as_view(), name='admin-subscription-update'),
    path('admin/shops/<uuid:shop_id>/activate/', AdminSubscriptionActivateView.as_view(), name='admin-shop-activate'),
    path('admin/plans/', AdminPlanListView.as_view(), name='admin-plans'),
]