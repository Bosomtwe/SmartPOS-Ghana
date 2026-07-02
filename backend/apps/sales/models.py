from django.db import models
from apps.core.models import BaseModel
from apps.users.models import Shop, User
from apps.customers.models import Customer
from apps.products.models import Product

class Sale(BaseModel):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='sales')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True)
    total_amount = models.DecimalField(max_digits=10, decimal_places=2)
    discount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    payment_method = models.CharField(max_length=20, choices=[('CASH', 'Cash'), ('MOMO', 'Mobile Money'), ('CREDIT', 'Credit')])
    momo_number = models.CharField(max_length=20, blank=True, default='')
    status = models.CharField(max_length=10, choices=[('COMPLETED', 'Completed'), ('VOIDED', 'Voided')], default='COMPLETED')
    void_reason = models.TextField(blank=True)
    idempotency_key = models.CharField(max_length=255, blank=True, null=True, db_index=True, unique=True)

    # ✅ NEW: Backdating audit fields
    is_backdated = models.BooleanField(default=False)
    original_created_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"Sale {self.id}"

    class Meta:
        indexes = [
            models.Index(fields=['shop', 'created_at']),
            models.Index(fields=['shop', 'status']),
            models.Index(fields=['customer']),
            models.Index(fields=['is_backdated']),  # ✅ for filtering backdated sales
        ]


class SaleItem(BaseModel):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    quantity = models.IntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    total = models.DecimalField(max_digits=10, decimal_places=2)

    class Meta:
        indexes = [
            models.Index(fields=['sale']),
            models.Index(fields=['product']),
        ]