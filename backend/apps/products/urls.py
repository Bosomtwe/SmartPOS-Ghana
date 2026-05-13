from django.urls import path
from .views import ProductListCreateView, ProductDetailView, StockAdjustView, BulkImportView, LowStockAlertsView, ProductExportView, ProductTemplateView

urlpatterns = [
    path('products/', ProductListCreateView.as_view(), name='product-list'),
    path('products/<uuid:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('products/<uuid:pk>/stock/', StockAdjustView.as_view(), name='product-stock'),
    path('products/bulk/', BulkImportView.as_view(), name='product-bulk'),
    path('inventory/alerts/', LowStockAlertsView.as_view(), name='low-stock-alerts'),
    path('products/export/', ProductExportView.as_view(), name='product-export'),
    path('products/template/', ProductTemplateView.as_view(), name='product-template'),
]