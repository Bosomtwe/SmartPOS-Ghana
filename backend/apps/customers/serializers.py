from rest_framework import serializers
from .models import Customer, CreditTransaction

class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ('id', 'name', 'phone', 'total_credit', 'credit_limit')

class CreditTransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = CreditTransaction
        fields = ('id', 'type', 'amount', 'balance_after', 'note', 'created_at', 'sale')  # added sale