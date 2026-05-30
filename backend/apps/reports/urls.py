from django.urls import path
from .views import (
    DashboardOverviewView,
    SalesReportExportView,
    SalesReportJsonView,
    StockReportExportView,
    TopProductsJsonView
)

urlpatterns = [
    path('reports/dashboard/', DashboardOverviewView.as_view(), name='dashboard-overview'),
    path('reports/sales/', SalesReportExportView.as_view(), name='sales-report'),
    path('reports/sales/json/', SalesReportJsonView.as_view(), name='sales-report-json'),
    path('reports/stock/', StockReportExportView.as_view(), name='stock-report'),
    path('reports/top-products/', TopProductsJsonView.as_view(), name='top-products'),
]