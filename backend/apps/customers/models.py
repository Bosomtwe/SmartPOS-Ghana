from django.db import models
from apps.core.models import BaseModel
from apps.users.models import Shop

class Customer(BaseModel):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='customers')
    name = models.CharField(max_length=255)
    phone = models.CharField(max_length=15, blank=True)
    total_credit = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    credit_limit = models.DecimalField(max_digits=10, decimal_places=2, blank=True, null=True)

    class Meta:
        unique_together = ('shop', 'phone')

class CreditTransaction(BaseModel):
    customer = models.ForeignKey(
        Customer,
        on_delete=models.PROTECT,
        related_name='transactions'
    )
    sale = models.ForeignKey(
        'sales.Sale',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='credittransaction'
    )
    type = models.CharField(max_length=10, choices=[('DEBT', 'Debt'), ('PAYMENT', 'Payment')])
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    balance_after = models.DecimalField(max_digits=10, decimal_places=2)
    note = models.TextField(blank=True)
    idempotency_key = models.CharField(max_length=255, blank=True, null=True, db_index=True, unique=True)