# apps/sales/serializers.py
from rest_framework import serializers
from .models import Sale, SaleItem
from apps.products.serializers import ProductSerializer

class SaleItemSerializer(serializers.ModelSerializer):
    product_detail = ProductSerializer(source='product', read_only=True)

    class Meta:
        model = SaleItem
        fields = ('id', 'product', 'product_detail', 'quantity', 'unit_price', 'total')


class SaleSerializer(serializers.ModelSerializer):
    items = SaleItemSerializer(many=True)
    total_paid = serializers.SerializerMethodField()
    balance = serializers.SerializerMethodField()
    momo_number = serializers.CharField(
        max_length=20, allow_blank=True, allow_null=True, default=''
    )
    customer_name = serializers.CharField(source='customer.name', read_only=True, default='Guest')
    customer_id = serializers.UUIDField(source='customer.id', read_only=True, allow_null=True)

    # ✅ Allow backdating via created_at (owners only – enforced in view)
    created_at = serializers.DateTimeField(required=False)

    class Meta:
        model = Sale
        fields = (
            'id', 'user', 'customer', 'customer_id', 'customer_name', 'total_amount', 'discount',
            'payment_method', 'momo_number', 'status', 'void_reason', 'created_at',
            'items', 'total_paid', 'balance', 'idempotency_key',
            'is_backdated', 'original_created_at',  # ✅ NEW
        )
        read_only_fields = (
            'user', 'status', 'total_paid', 'balance', 'idempotency_key',
            'customer_name', 'customer_id', 'is_backdated', 'original_created_at'
        )

    def get_total_paid(self, obj):
        return getattr(obj, 'total_paid', 0) or 0

    def get_balance(self, obj):
        paid = self.get_total_paid(obj)
        return obj.total_amount - paid

    def validate_momo_number(self, value):
        if value is None:
            return ''
        return value