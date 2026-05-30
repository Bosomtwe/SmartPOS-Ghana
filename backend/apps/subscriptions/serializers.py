from rest_framework import serializers
from .models import SubscriptionPlan, ShopSubscription
from apps.users.models import Shop

class ShopSerializer(serializers.ModelSerializer):
    owner_phone = serializers.CharField(source='owner.phone', read_only=True, default=None)
    
    class Meta:
        model = Shop
        fields = ['id', 'name', 'owner_phone']


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubscriptionPlan
        fields = ['id', 'name', 'duration_days', 'price', 
                  'max_users', 'max_products', 'allow_credit_sales',
                  'allow_bulk_import', 'allow_audit_logs', 'allow_analytics']


class ShopSubscriptionSerializer(serializers.ModelSerializer):
    plan_name = serializers.CharField(source='plan.name', read_only=True)
    is_active = serializers.BooleanField(read_only=True)
    shop = ShopSerializer(read_only=True)
    # Explicit PrimaryKeyRelatedField for plan to ensure updates work
    plan = serializers.PrimaryKeyRelatedField(queryset=SubscriptionPlan.objects.all())

    class Meta:
        model = ShopSubscription
        fields = ['id', 'shop', 'plan', 'plan_name', 'start_date', 'end_date', 
                  'is_trial', 'is_active', 'auto_renew']