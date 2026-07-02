from rest_framework import serializers
from .models import Product, InventoryTransaction


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = (
            'id', 'name', 'sku', 'cost_price', 'selling_price',
            'current_stock', 'low_stock_threshold', 'is_active',
            'custom_fields'   # ✅ added
        )


class InventoryTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryTransaction
        fields = ('id', 'product', 'type', 'quantity', 'previous_quantity', 'new_quantity', 'reason', 'created_at')