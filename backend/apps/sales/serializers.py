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
    )  # ← Accept null and convert to ''

    class Meta:
        model = Sale
        fields = (
            'id', 'user', 'customer', 'total_amount', 'discount',
            'payment_method', 'momo_number',
            'status', 'void_reason', 'created_at',
            'items', 'total_paid', 'balance',
            'idempotency_key'
        )
        read_only_fields = ('user', 'status', 'total_paid', 'balance', 'idempotency_key')

    def get_total_paid(self, obj):
        return getattr(obj, 'total_paid', 0) or 0

    def get_balance(self, obj):
        paid = self.get_total_paid(obj)
        return obj.total_amount - paid

    def validate_momo_number(self, value):
        # If None is sent, replace with empty string
        if value is None:
            return ''
        return value