# apps/products/views.py
import logging
from rest_framework import generics, filters, status, permissions
from rest_framework.response import Response
from django.db import transaction
from django.db import models
from django.db.utils import IntegrityError
from django.core.cache import cache
from .models import Product, InventoryTransaction
from .serializers import ProductSerializer, InventoryTransactionSerializer
from ..core.permissions import IsOwnerOrCashierReadOnly
import pandas as pd
from rest_framework.parsers import MultiPartParser
import csv
from django.http import HttpResponse
from apps.audit.utils import log_action

# ✅ Import subscription permissions
from apps.subscriptions.permissions import MaxProductsPermission, HasSubscriptionFeature

logger = logging.getLogger(__name__)


# ✅ Apply MaxProductsPermission to product creation
class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly, MaxProductsPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'sku']
    pagination_class = None

    def get_queryset(self):
        shop = self.request.user.shop
        cache_key = f'product_list_{shop.id}'
        products = cache.get(cache_key)

        if products is None:
            products = list(Product.objects.filter(shop=shop, is_active=True))
            cache.set(cache_key, products, 60 * 5)

        return products

    def perform_create(self, serializer):
        instance = serializer.save(shop=self.request.user.shop)
        cache.delete(f'product_list_{self.request.user.shop.id}')


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly]

    def get_queryset(self):
        return Product.objects.filter(shop=self.request.user.shop)

    def partial_update(self, request, *args, **kwargs):
        try:
            response = super().partial_update(request, *args, **kwargs)
            cache.delete(f'product_list_{self.request.user.shop.id}')
            return response
        except IntegrityError as e:
            if 'unique constraint' in str(e) and 'sku' in str(e):
                return Response(
                    {"error": "SKU already exists for another product in this shop."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            raise

    def update(self, request, *args, **kwargs):
        try:
            response = super().update(request, *args, **kwargs)
            cache.delete(f'product_list_{self.request.user.shop.id}')
            return response
        except IntegrityError as e:
            if 'unique constraint' in str(e) and 'sku' in str(e):
                return Response(
                    {"error": "SKU already exists for another product in this shop."},
                    status=status.HTTP_400_BAD_REQUEST
                )
            raise

    def perform_destroy(self, instance):
        instance.is_active = False
        instance.save()
        cache.delete(f'product_list_{instance.shop_id}')


class StockAdjustView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly]

    def post(self, request, pk):
        product = Product.objects.get(pk=pk, shop=request.user.shop)
        delta = request.data.get('quantity', 0)
        reason = request.data.get('reason', '')

        with transaction.atomic():
            old_stock = product.current_stock
            new_stock = old_stock + delta
            product.current_stock = new_stock
            product.save()

            InventoryTransaction.objects.create(
                product=product,
                user=request.user,
                type='ADJUSTMENT',
                quantity=delta,
                previous_quantity=old_stock,
                new_quantity=new_stock,
                reason=reason
            )

            log_action(
                shop=request.user.shop,
                user=request.user,
                action='STOCK_ADJUST',
                details={
                    'product_id': str(product.id),
                    'product_name': product.name,
                    'quantity': delta,
                    'reason': reason,
                    'old_stock': old_stock,
                    'new_stock': new_stock
                },
                request=request
            )

        cache.delete(f'product_list_{request.user.shop.id}')
        return Response(ProductSerializer(product).data)


# ✅ Apply HasSubscriptionFeature to bulk import (only allowed if plan permits)
class BulkImportView(generics.GenericAPIView):
    parser_classes = [MultiPartParser]
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly, HasSubscriptionFeature]
    subscription_feature = 'allow_bulk_import'

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        # Also check product limit before importing
        shop = request.user.shop
        current_product_count = Product.objects.filter(shop=shop, is_active=True).count()
        plan = shop.subscription.plan if hasattr(shop, 'subscription') else None
        if plan and current_product_count >= plan.max_products:
            return Response(
                {'error': f'Product limit reached. Your plan allows only {plan.max_products} products.'},
                status=status.HTTP_403_FORBIDDEN
            )

        try:
            if file.name.endswith('.csv'):
                df = pd.read_csv(file, dtype=str, keep_default_na=False)
            else:
                df = pd.read_excel(file, dtype=str, keep_default_na=False)
        except Exception as e:
            return Response({'error': f'Error reading file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)

        rename_map = {
            'SKU (Barcode)': 'sku',
            'SKU': 'sku',
            'sku (barcode)': 'sku',
            'Low Stock Threshold': 'low_stock_threshold',
            'low stock threshold': 'low_stock_threshold',
        }
        df.rename(columns=rename_map, inplace=True)

        required = ['name', 'cost_price', 'selling_price', 'current_stock']
        missing = [col for col in required if col not in df.columns]
        if missing:
            return Response(
                {'error': f'Missing required columns: {missing}. Found columns: {list(df.columns)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        errors = []
        created = 0
        updated = 0
        max_products_allowed = plan.max_products if plan else float('inf')

        for idx, row in df.iterrows():
            # Stop if we reach the product limit
            if created + updated >= max_products_allowed:
                errors.append(f"Row {idx+2}: Import stopped – product limit reached.")
                break

            try:
                sku_val = row.get('sku', '')
                sku = str(sku_val).strip() if sku_val and str(sku_val).strip() else None

                product = None
                if sku:
                    product = Product.objects.filter(shop=shop, sku=sku).first()

                cost_price = float(row['cost_price'].replace(',', ''))
                selling_price = float(row['selling_price'].replace(',', ''))
                current_stock = int(float(row['current_stock'].replace(',', '')))

                low_stock_val = row.get('low_stock_threshold', '')
                low_stock_threshold = int(float(str(low_stock_val).replace(',', ''))) if low_stock_val and str(low_stock_val).strip() else 5

                data = {
                    'name': str(row['name']).strip(),
                    'cost_price': cost_price,
                    'selling_price': selling_price,
                    'current_stock': current_stock,
                    'sku': sku,
                    'low_stock_threshold': low_stock_threshold,
                    'is_active': True,
                }

                if product:
                    for key, value in data.items():
                        setattr(product, key, value)
                    product.save()
                    updated += 1
                else:
                    Product.objects.create(shop=shop, **data)
                    created += 1

            except Exception as e:
                errors.append(f"Row {idx+2}: {str(e)}")

        cache.delete(f'product_list_{shop.id}')

        return Response({
            'created': created,
            'updated': updated,
            'errors': errors
        }, status=status.HTTP_200_OK)


class LowStockAlertsView(generics.ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Product.objects.filter(
            shop=self.request.user.shop,
            current_stock__lte=models.F('low_stock_threshold'),
            is_active=True
        )


class ProductExportView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        products = Product.objects.filter(shop=request.user.shop, is_active=True)
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="products.csv"'

        writer = csv.writer(response)
        writer.writerow(['name', 'sku', 'cost_price', 'selling_price', 'current_stock', 'low_stock_threshold'])

        for p in products:
            writer.writerow([
                p.name,
                p.sku or '',
                p.cost_price,
                p.selling_price,
                p.current_stock,
                p.low_stock_threshold,
            ])

        log_action(
            shop=request.user.shop,
            user=request.user,
            action='BACKUP_DOWNLOAD',
            details={'type': 'product_export'},
            request=request
        )
        return response


class ProductTemplateView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="product_import_template.csv"'
        writer = csv.writer(response)
        writer.writerow(['name', 'SKU (Barcode)', 'cost_price', 'selling_price', 'current_stock', 'Low Stock Threshold'])
        return response