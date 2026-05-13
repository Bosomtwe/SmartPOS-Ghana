from django.urls import path
from .views import CustomerListCreateView, CustomerDetailView, CustomerTransactionsView, RecordPaymentView, CustomerOutstandingSalesView

urlpatterns = [
    path('customers/', CustomerListCreateView.as_view(), name='customer-list'),
    path('customers/<uuid:pk>/', CustomerDetailView.as_view(), name='customer-detail'),
   # path('customers/<uuid:pk>/credit/', CreditPaymentView.as_view(), name='credit-payment'),
    path('customers/<uuid:pk>/transactions/', CustomerTransactionsView.as_view(), name='customer-transactions'),
    path('customers/<uuid:customer_id>/record_payment/', RecordPaymentView.as_view(), name='record-payment'),
    path('customers/<uuid:customer_id>/outstanding_sales/', CustomerOutstandingSalesView.as_view(), name='outstanding-sales'),
]