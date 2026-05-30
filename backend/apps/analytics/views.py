from datetime import timedelta
from django.db.models import Sum, Count, Q, Subquery, Avg, OuterRef, DecimalField, Value, IntegerField
from django.db.models.functions import Coalesce, TruncWeek, TruncDate
from django.utils import timezone
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination

from apps.users.models import Shop, User
from apps.sales.models import Sale
from apps.products.models import Product
from apps.audit.models import AuditLog
from apps.customers.models import Customer

from .permissions import IsSuperUser
from .mixins import DateRangeMixin
from .serializers import (
    OverviewSerializer,
    ShopPerformanceSerializer,
    FeatureUsageResponseSerializer,
    GrowthSerializer,
    HealthSerializer,
    UserActivitySerializer,
)


class OverviewView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        today = timezone.now()
        last_week = today - timedelta(days=7)
        last_month = today - timedelta(days=30)

        total_shops = Shop.objects.count()
        total_users = User.objects.count()
        total_owners = User.objects.filter(role='OWNER').count()
        total_cashiers = User.objects.filter(role='CASHIER').count()
        total_products = Product.objects.filter(is_active=True).count()

        gmv = Sale.objects.filter(status='COMPLETED').aggregate(total=Sum('total_amount'))['total'] or 0
        avg_sale = Sale.objects.filter(status='COMPLETED').aggregate(avg=Avg('total_amount'))['avg'] or 0
        total_sales_count = Sale.objects.filter(status='COMPLETED').count()

        active_shops_7d = AuditLog.objects.filter(
            action=AuditLog.ActionType.LOGIN,
            created_at__gte=last_week
        ).values('shop_id').distinct().count()

        active_shops_30d = AuditLog.objects.filter(
            action=AuditLog.ActionType.LOGIN,
            created_at__gte=last_month
        ).values('shop_id').distinct().count()

        data = {
            'total_shops': total_shops,
            'total_users': total_users,
            'total_owners': total_owners,
            'total_cashiers': total_cashiers,
            'total_products': total_products,
            'total_sales_count': total_sales_count,
            'gmv': gmv,
            'avg_sale_amount': avg_sale,
            'active_shops_7d': active_shops_7d,
            'active_shops_30d': active_shops_30d,
        }
        serializer = OverviewSerializer(data)
        return Response(serializer.data)


class ShopPerformancePagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class ShopPerformanceView(APIView):
    permission_classes = [IsSuperUser]
    pagination_class = ShopPerformancePagination

    def get(self, request):
        # Base queryset – we will annotate using subqueries to avoid multiplication
        shops = Shop.objects.select_related('owner').all()

        # Subquery for total_sales (sum of total_amount for completed sales)
        total_sales_sub = Subquery(
            Sale.objects.filter(
                shop=OuterRef('pk'),
                status='COMPLETED'
            ).values('shop').annotate(
                total=Sum('total_amount')
            ).values('total')[:1]
        )

        # Subquery for sales_count
        sales_count_sub = Subquery(
            Sale.objects.filter(
                shop=OuterRef('pk'),
                status='COMPLETED'
            ).values('shop').annotate(
                cnt=Count('id')
            ).values('cnt')[:1]
        )

        # Subquery for avg_sale (calculated as total / count, but we can use Avg directly in subquery)
        avg_sale_sub = Subquery(
            Sale.objects.filter(
                shop=OuterRef('pk'),
                status='COMPLETED'
            ).values('shop').annotate(
                avg=Avg('total_amount')
            ).values('avg')[:1]
        )

        # Subquery for total_credit (sum of customer total_credit)
        total_credit_sub = Subquery(
            Customer.objects.filter(
                shop=OuterRef('pk')
            ).values('shop').annotate(
                total=Sum('total_credit')
            ).values('total')[:1]
        )

        # Subquery for credit_customers (count of customers with total_credit > 0)
        credit_customers_sub = Subquery(
            Customer.objects.filter(
                shop=OuterRef('pk'),
                total_credit__gt=0
            ).values('shop').annotate(
                cnt=Count('id')
            ).values('cnt')[:1]
        )

        # Subquery for products_count (active products only)
        products_count_sub = Subquery(
            Product.objects.filter(
                shop=OuterRef('pk'),
                is_active=True
            ).values('shop').annotate(
                cnt=Count('id')
            ).values('cnt')[:1]
        )

        # Subquery for last_activity (most recent LOGIN audit log)
        last_activity_sub = Subquery(
            AuditLog.objects.filter(
                shop=OuterRef('pk'),
                action=AuditLog.ActionType.LOGIN
            ).order_by('-created_at').values('created_at')[:1]
        )

        # Apply annotations using Coalesce to handle nulls
        shops = shops.annotate(
            total_sales=Coalesce(total_sales_sub, Value(0), output_field=DecimalField(max_digits=15, decimal_places=2)),
            sales_count=Coalesce(sales_count_sub, Value(0), output_field=IntegerField()),
            avg_sale=Coalesce(avg_sale_sub, Value(0), output_field=DecimalField(max_digits=10, decimal_places=2)),
            total_credit=Coalesce(total_credit_sub, Value(0), output_field=DecimalField(max_digits=15, decimal_places=2)),
            credit_customers=Coalesce(credit_customers_sub, Value(0), output_field=IntegerField()),
            products_count=Coalesce(products_count_sub, Value(0), output_field=IntegerField()),
            last_activity=last_activity_sub,
        ).order_by('-total_sales')

        paginator = self.pagination_class()
        page = paginator.paginate_queryset(shops, request)
        if page is not None:
            serializer = ShopPerformanceSerializer(page, many=True)
            return paginator.get_paginated_response(serializer.data)

        serializer = ShopPerformanceSerializer(shops, many=True)
        return Response(serializer.data)


class FeatureUsageView(APIView, DateRangeMixin):
    permission_classes = [IsSuperUser]

    def get(self, request):
        start, end = self.get_date_range(request)
        if start is None or end is None:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=400,
            )

        qs = AuditLog.objects.filter(
            created_at__date__gte=start,
            created_at__date__lte=end
        ).annotate(date=TruncDate('created_at')).values('date', 'action').annotate(
            count=Count('id')
        ).order_by('date')

        date_range = [start + timedelta(days=i) for i in range((end - start).days + 1)]

        series_dict = {}
        for item in qs:
            action = item['action']
            if action not in series_dict:
                series_dict[action] = {str(d): 0 for d in date_range}
            series_dict[action][str(item['date'])] = item['count']

        series = []
        for action, date_map in series_dict.items():
            data = [{'date': str(d), 'count': date_map[str(d)]} for d in date_range]
            series.append({'action': action, 'data': data})

        response_data = {
            'start': start,
            'end': end,
            'series': series,
        }
        serializer = FeatureUsageResponseSerializer(response_data)
        return Response(serializer.data)


class GrowthView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        shops_weekly = Shop.objects.annotate(
            week=TruncWeek('created_at')
        ).values('week').annotate(count=Count('id')).order_by('week')

        sales_daily = Sale.objects.filter(status='COMPLETED').annotate(
            day=TruncDate('created_at')
        ).values('day').annotate(amount=Sum('total_amount'), count=Count('id')).order_by('day')

        data = {
            'shops_weekly': list(shops_weekly),
            'sales_daily': list(sales_daily),
        }
        serializer = GrowthSerializer(data)
        return Response(serializer.data)


class HealthView(APIView):
    permission_classes = [IsSuperUser]

    def get(self, request):
        voided_sales = Sale.objects.filter(status='VOIDED').count()
        total_sales = Sale.objects.count()
        void_rate = voided_sales / total_sales if total_sales else 0

        failed_logins = AuditLog.objects.filter(action=AuditLog.ActionType.LOGIN_FAILED).count()
        inventory_adjustments = AuditLog.objects.filter(action=AuditLog.ActionType.STOCK_ADJUST).count()

        data = {
            'voided_sales': voided_sales,
            'total_sales': total_sales,
            'void_rate': void_rate,
            'failed_logins': failed_logins,
            'inventory_adjustments': inventory_adjustments,
        }
        serializer = HealthSerializer(data)
        return Response(serializer.data)


class UserActivityView(APIView, DateRangeMixin):
    permission_classes = [IsSuperUser]

    def get(self, request):
        start, end = self.get_date_range(request)
        if start is None or end is None:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=400,
            )

        logins = AuditLog.objects.filter(
            action=AuditLog.ActionType.LOGIN,
            created_at__date__gte=start,
            created_at__date__lte=end
        ).annotate(date=TruncDate('created_at')).values('date', 'user__role').annotate(
            count=Count('user_id', distinct=True)
        ).order_by('date')

        owners = {}
        cashiers = {}
        for item in logins:
            if item['user__role'] == 'OWNER':
                owners[item['date'].isoformat()] = item['count']
            else:
                cashiers[item['date'].isoformat()] = item['count']

        data = {
            'active_owners': owners,
            'active_cashiers': cashiers,
        }
        serializer = UserActivitySerializer(data)
        return Response(serializer.data)