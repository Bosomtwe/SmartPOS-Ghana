from django.urls import path
from .views import DashboardOverviewView, SalesReportExportView, StockReportExportView

urlpatterns = [
    path('reports/dashboard/', DashboardOverviewView.as_view(), name='dashboard-overview'),
    path('reports/sales/', SalesReportExportView.as_view(), name='sales-report'),
    path('reports/stock/', StockReportExportView.as_view(), name='stock-report'),
]