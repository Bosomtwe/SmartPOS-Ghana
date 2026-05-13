from rest_framework import serializers

class OverviewSerializer(serializers.Serializer):
    total_shops = serializers.IntegerField()
    total_users = serializers.IntegerField()
    total_owners = serializers.IntegerField()
    total_cashiers = serializers.IntegerField()
    total_products = serializers.IntegerField()
    total_sales_count = serializers.IntegerField()
    gmv = serializers.DecimalField(max_digits=15, decimal_places=2)
    avg_sale_amount = serializers.DecimalField(max_digits=10, decimal_places=2)
    active_shops_7d = serializers.IntegerField()
    active_shops_30d = serializers.IntegerField()


class ShopPerformanceSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    name = serializers.CharField()
    address = serializers.CharField(allow_blank=True)
    total_sales = serializers.DecimalField(max_digits=15, decimal_places=2)
    sales_count = serializers.IntegerField()
    avg_sale = serializers.DecimalField(max_digits=10, decimal_places=2)
    total_credit = serializers.DecimalField(max_digits=15, decimal_places=2)
    credit_customers = serializers.IntegerField()
    products_count = serializers.IntegerField()
    last_activity = serializers.DateTimeField(allow_null=True)


class DateCountSerializer(serializers.Serializer):
    date = serializers.DateField()
    count = serializers.IntegerField()


class FeatureUsageSeriesSerializer(serializers.Serializer):
    action = serializers.CharField()
    data = DateCountSerializer(many=True)


class FeatureUsageResponseSerializer(serializers.Serializer):
    start = serializers.DateField()
    end = serializers.DateField()
    series = FeatureUsageSeriesSerializer(many=True)


class GrowthSerializer(serializers.Serializer):
    shops_weekly = serializers.ListField(child=serializers.DictField())
    sales_daily = serializers.ListField(child=serializers.DictField())


class HealthSerializer(serializers.Serializer):
    voided_sales = serializers.IntegerField()
    total_sales = serializers.IntegerField()
    void_rate = serializers.FloatField()
    failed_logins = serializers.IntegerField()
    inventory_adjustments = serializers.IntegerField()


class UserActivitySerializer(serializers.Serializer):
    active_owners = serializers.DictField(child=serializers.IntegerField())
    active_cashiers = serializers.DictField(child=serializers.IntegerField())