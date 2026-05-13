from rest_framework import generics, permissions
from rest_framework.response import Response
from django.db.models import Sum, Count, Q, F
from django.utils import timezone
from datetime import datetime, timedelta
from apps.products.models import Product
from apps.sales.models import Sale, SaleItem
from apps.sales.serializers import SaleSerializer
import csv
from django.http import HttpResponse


class DashboardOverviewView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        shop = request.user.shop

        # ---------- 1. parse date range ----------
        start_str = request.query_params.get('start')
        end_str = request.query_params.get('end')

        today = timezone.now().date()
        if not start_str:
            start = today
        else:
            start = datetime.strptime(start_str, '%Y-%m-%d').date()

        if not end_str:
            end = today
        else:
            end = datetime.strptime(end_str, '%Y-%m-%d').date()

        # ---------- 2. base queryset ----------
        sales_qs = Sale.objects.filter(
            shop=shop,
            status='COMPLETED',
            created_at__date__gte=start,
            created_at__date__lte=end
        )

        # ---------- 3. current period aggregates ----------
        total_sales = sales_qs.aggregate(total=Sum('total_amount'))['total'] or 0
        transaction_count = sales_qs.count()
        avg_sale = total_sales / transaction_count if transaction_count else 0

        # profit & missing cost price flag
        profit = 0
        missing_cost_price = False
        for sale in sales_qs:   # for larger data you might use annotate, but fine for typical usage
            for item in sale.items.all():
                if item.product and item.product.cost_price is not None:
                    profit += item.quantity * (item.unit_price - item.product.cost_price)
                else:
                    missing_cost_price = True

        # top products
        top_products = (
            SaleItem.objects.filter(
                sale__shop=shop,
                sale__created_at__date__gte=start,
                sale__created_at__date__lte=end,
                sale__status='COMPLETED'
            )
            .values('product__name')
            .annotate(total_sold=Sum('quantity'))
            .order_by('-total_sold')[:5]
        )
        top_products_list = [
            {'name': item['product__name'], 'total_sold': item['total_sold']}
            for item in top_products
        ]

        # ---------- 4. previous period (same length) for trends ----------
        delta = (end - start).days
        prev_start = start - timedelta(days=delta + 1)
        prev_end = start - timedelta(days=1)

        prev_sales = Sale.objects.filter(
            shop=shop,
            status='COMPLETED',
            created_at__date__gte=prev_start,
            created_at__date__lte=prev_end
        )
        prev_total_sales = prev_sales.aggregate(total=Sum('total_amount'))['total'] or 0

        prev_profit = 0
        for sale in prev_sales:
            for item in sale.items.all():
                if item.product and item.product.cost_price is not None:
                    prev_profit += item.quantity * (item.unit_price - item.product.cost_price)
                # ignore missing cost for previous period flag

        # ---------- 5. low stock count ----------
        low_stock_count = Product.objects.filter(
            shop=shop,
            current_stock__lte=F('low_stock_threshold'),
            is_active=True
        ).count()

        return Response({
            'total_sales': total_sales,
            'profit': profit,
            'missing_cost_price': missing_cost_price,
            'top_products': top_products_list,
            'transaction_count': transaction_count,
            'avg_sale': round(avg_sale, 2),
            'prev_total_sales': prev_total_sales,
            'prev_profit': round(prev_profit, 2) if prev_profit else 0,
            'low_stock_count': low_stock_count,
        })


class SalesReportExportView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        # Get date range from query params
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')

        sales_qs = Sale.objects.filter(
            shop=request.user.shop,
            status='COMPLETED'
        ).select_related('customer').prefetch_related('items__product')

        if start_date:
            sales_qs = sales_qs.filter(created_at__date__gte=start_date)
        if end_date:
            sales_qs = sales_qs.filter(created_at__date__lte=end_date)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="sales_report.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Sale ID', 'Date', 'Customer', 'Total Amount', 'Discount',
            'Payment Method', 'Items'
        ])

        for sale in sales_qs:
            items_summary = ', '.join([
                f"{item.product.name if item.product else 'Unknown'} x{item.quantity}"
                for item in sale.items.all()
            ])
            writer.writerow([
                str(sale.id),
                sale.created_at.strftime('%Y-%m-%d %H:%M'),
                sale.customer.name if sale.customer else '',
                sale.total_amount,
                sale.discount,
                sale.payment_method,
                items_summary,
            ])

        return response


class StockReportExportView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        products = Product.objects.filter(
            shop=request.user.shop,
            is_active=True
        ).order_by('name')

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="stock_report.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'Name', 'SKU', 'Cost Price', 'Selling Price',
            'Current Stock', 'Low Stock Threshold'
        ])

        for p in products:
            writer.writerow([
                p.name,
                p.sku or '',
                p.cost_price,
                p.selling_price,
                p.current_stock,
                p.low_stock_threshold,
            ])

        return response