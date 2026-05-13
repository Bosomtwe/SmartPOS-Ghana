from django.urls import path
from .views import (
    OverviewView, ShopPerformanceView, FeatureUsageView,
    GrowthView, HealthView, UserActivityView
)

urlpatterns = [
    path('overview/', OverviewView.as_view(), name='analytics-overview'),
    path('shop-performance/', ShopPerformanceView.as_view(), name='analytics-shop-performance'),
    path('feature-usage/', FeatureUsageView.as_view(), name='analytics-feature-usage'),
    path('growth/', GrowthView.as_view(), name='analytics-growth'),
    path('health/', HealthView.as_view(), name='analytics-health'),
    path('user-activity/', UserActivityView.as_view(), name='analytics-user-activity'),
]