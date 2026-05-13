from django.urls import path
from .views import SaleCreateView, SaleListView, SaleDetailView, SaleVoidView, SyncSalesView

urlpatterns = [
    path('sales/', SaleCreateView.as_view(), name='sale-create'),
    path('sales/list/', SaleListView.as_view(), name='sale-list'),
    path('sales/<uuid:pk>/', SaleDetailView.as_view(), name='sale-detail'),
    path('sales/<uuid:pk>/void/', SaleVoidView.as_view(), name='sale-void'),
    path('sales/sync/', SyncSalesView.as_view(), name='sales-sync'),
]