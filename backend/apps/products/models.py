from django.db import models
from apps.core.models import BaseModel
from apps.users.models import Shop, User


class Product(BaseModel):
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='products')
    name = models.CharField(max_length=255)
    sku = models.CharField(max_length=100, blank=True, null=True)  # used as barcode
    cost_price = models.DecimalField(max_digits=10, decimal_places=2)
    selling_price = models.DecimalField(max_digits=10, decimal_places=2)
    current_stock = models.IntegerField(default=0)
    low_stock_threshold = models.IntegerField(default=5)
    is_active = models.BooleanField(default=True)

    # ✅ NEW: flexible JSON field for any extra data (expiry, shelf, supplier, etc.)
    custom_fields = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ('shop', 'sku')  # SKU unique per shop

    def __str__(self):
        return self.name


class InventoryTransaction(BaseModel):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='transactions')
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    type = models.CharField(max_length=20, choices=[('SALE', 'Sale'), ('RESTOCK', 'Restock'), ('ADJUSTMENT', 'Adjustment')])
    quantity = models.IntegerField()  # positive or negative delta
    previous_quantity = models.IntegerField()
    new_quantity = models.IntegerField()
    reason = models.TextField(blank=True)