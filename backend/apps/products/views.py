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
from datetime import datetime

# ✅ Import subscription permissions
from apps.subscriptions.permissions import MaxProductsPermission, HasSubscriptionFeature

logger = logging.getLogger(__name__)


# Helper to safely get shop or return None
def get_user_shop(user):
    if not user or not user.is_authenticated:
        return None
    return user.shop


# ✅ Apply MaxProductsPermission to product creation (still enforces limit for single creation)
class ProductListCreateView(generics.ListCreateAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly, MaxProductsPermission]
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'sku']
    pagination_class = None

    def get_queryset(self):
        shop = get_user_shop(self.request.user)
        if not shop:
            return Product.objects.none()
        cache_key = f'product_list_{shop.id}'
        products = cache.get(cache_key)
        if products is None:
            products = list(Product.objects.filter(shop=shop, is_active=True))
            cache.set(cache_key, products, 60 * 5)
        return products

    def perform_create(self, serializer):
        shop = get_user_shop(self.request.user)
        if not shop:
            raise PermissionError("User has no associated shop")
        instance = serializer.save(shop=shop)
        # Set initial stock if not provided
        if not instance.custom_fields.get('initial_stock'):
            instance.custom_fields['initial_stock'] = instance.current_stock
            instance.save(update_fields=['custom_fields'])
        cache.delete(f'product_list_{shop.id}')


class ProductDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly]

    def get_queryset(self):
        shop = get_user_shop(self.request.user)
        if not shop:
            return Product.objects.none()
        return Product.objects.filter(shop=shop)

    def partial_update(self, request, *args, **kwargs):
        try:
            response = super().partial_update(request, *args, **kwargs)
            shop = get_user_shop(request.user)
            if shop:
                cache.delete(f'product_list_{shop.id}')
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
            shop = get_user_shop(request.user)
            if shop:
                cache.delete(f'product_list_{shop.id}')
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
        shop = instance.shop_id
        cache.delete(f'product_list_{shop}')


class StockAdjustView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly]

    def post(self, request, pk):
        shop = get_user_shop(request.user)
        if not shop:
            return Response({"error": "User has no associated shop"}, status=400)

        try:
            product = Product.objects.get(pk=pk, shop=shop)
        except Product.DoesNotExist:
            return Response({"error": "Product not found"}, status=404)

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
                shop=shop,
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

        cache.delete(f'product_list_{shop.id}')
        return Response(ProductSerializer(product).data)


# ✅ Bulk import – with expiry, initial_stock, and only 'name' required
class BulkImportView(generics.GenericAPIView):
    parser_classes = [MultiPartParser]
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly, HasSubscriptionFeature]
    subscription_feature = 'allow_bulk_import'

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        shop = get_user_shop(request.user)
        if not shop:
            return Response({'error': 'User has no associated shop'}, status=400)

        # Read file
        try:
            if file.name.endswith('.csv'):
                df = pd.read_csv(file, dtype=str, keep_default_na=False)
            else:
                df = pd.read_excel(file, dtype=str, keep_default_na=False)
        except Exception as e:
            logger.exception("Bulk import file read error")
            return Response({'error': f'Error reading file: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)

        # Clean column names and data
        df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)
        rename_map = {
            'SKU (Barcode)': 'sku', 'SKU': 'sku', 'sku (barcode)': 'sku',
            'Low Stock Threshold': 'low_stock_threshold', 'low stock threshold': 'low_stock_threshold',
        }
        df.rename(columns=rename_map, inplace=True)

        # ✅ Only require 'name'
        required = ['name']
        missing = [col for col in required if col not in df.columns]
        if missing:
            return Response(
                {'error': f'Missing required column: {missing}. Found columns: {list(df.columns)}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # ✅ Check for optional columns
        expiry_col = 'expiry' if 'expiry' in df.columns else 'expiry_date' if 'expiry_date' in df.columns else None
        has_initial_stock = 'initial_stock' in df.columns

        def to_float(val):
            if pd.isna(val) or str(val).strip() == '':
                return 0.0
            try:
                return float(str(val).replace(',', ''))
            except:
                return 0.0

        def to_int(val):
            if pd.isna(val) or str(val).strip() == '':
                return 0
            try:
                return int(float(str(val).replace(',', '')))
            except:
                return 0

        rows_data = []
        skus = []
        errors = []

        for idx, row in df.iterrows():
            try:
                sku_val = row.get('sku', '')
                sku = str(sku_val).strip() if sku_val and str(sku_val).strip() else None
                skus.append(sku)

                name = str(row['name']).strip()
                if not name:
                    raise ValueError("Product name is required")

                # Optional fields with defaults
                cost_price = to_float(row.get('cost_price', 0))
                selling_price = to_float(row.get('selling_price', 0))
                current_stock = to_int(row.get('current_stock', 0))

                low_stock_val = row.get('low_stock_threshold', '')
                low_stock_threshold = 5
                if low_stock_val and str(low_stock_val).strip():
                    low_stock_threshold = to_int(low_stock_val)

                # ✅ Build custom_fields
                custom_fields = {}

                # ✅ Handle expiry if column exists
                if expiry_col:
                    expiry_val = row.get(expiry_col)
                    if expiry_val and str(expiry_val).strip():
                        # Try to parse as ISO date (YYYY-MM-DD) or common formats
                        parsed_date = None
                        for fmt in ('%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d'):
                            try:
                                parsed_date = datetime.strptime(str(expiry_val).strip(), fmt).date()
                                break
                            except ValueError:
                                continue
                        if parsed_date:
                            custom_fields['expiry'] = parsed_date.isoformat()
                        else:
                            # fallback: store as string
                            custom_fields['expiry'] = str(expiry_val)

                # ✅ Handle initial_stock
                if has_initial_stock:
                    initial_val = row.get('initial_stock')
                    if initial_val and str(initial_val).strip():
                        custom_fields['initial_stock'] = to_int(initial_val)
                    else:
                        custom_fields['initial_stock'] = current_stock
                else:
                    custom_fields['initial_stock'] = current_stock

                rows_data.append({
                    'name': name,
                    'cost_price': cost_price,
                    'selling_price': selling_price,
                    'current_stock': current_stock,
                    'sku': sku,
                    'low_stock_threshold': low_stock_threshold,
                    'is_active': True,
                    'custom_fields': custom_fields,
                })
            except Exception as e:
                errors.append(f"Row {idx+2}: {str(e)}")

        if errors:
            return Response({'created': 0, 'updated': 0, 'errors': errors}, status=status.HTTP_200_OK)

        # Fetch existing products for non-null SKUs
        existing_sku_map = {}
        non_null_skus = [s for s in skus if s is not None]
        if non_null_skus:
            existing_products = Product.objects.filter(shop=shop, sku__in=non_null_skus)
            existing_sku_map = {p.sku: p for p in existing_products}

        # Separate into create and update lists
        products_to_create = []
        products_to_update = []

        for data in rows_data:
            sku = data['sku']
            if sku and sku in existing_sku_map:
                product = existing_sku_map[sku]
                product.name = data['name']
                product.cost_price = data['cost_price']
                product.selling_price = data['selling_price']
                product.current_stock = data['current_stock']
                product.low_stock_threshold = data['low_stock_threshold']
                product.is_active = data['is_active']
                product.custom_fields = data['custom_fields']
                products_to_update.append(product)
            else:
                products_to_create.append(Product(shop=shop, **data))

        # Bulk operations
        created_count = 0
        updated_count = 0
        with transaction.atomic():
            if products_to_create:
                Product.objects.bulk_create(products_to_create)
                created_count = len(products_to_create)
            if products_to_update:
                Product.objects.bulk_update(
                    products_to_update,
                    fields=['name', 'cost_price', 'selling_price', 'current_stock',
                            'low_stock_threshold', 'is_active', 'custom_fields']
                )
                updated_count = len(products_to_update)

        # Invalidate cache
        cache.delete(f'product_list_{shop.id}')

        return Response({
            'created': created_count,
            'updated': updated_count,
            'errors': errors,
        }, status=status.HTTP_200_OK)


class LowStockAlertsView(generics.ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        shop = get_user_shop(self.request.user)
        if not shop:
            return Product.objects.none()
        return Product.objects.filter(
            shop=shop,
            current_stock__lte=models.F('low_stock_threshold'),
            is_active=True
        )


class ProductExportView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        shop = get_user_shop(request.user)
        if not shop:
            return Response({"error": "User has no associated shop"}, status=400)

        products = Product.objects.filter(shop=shop, is_active=True)
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="products.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'name', 'sku', 'cost_price', 'selling_price',
            'current_stock', 'low_stock_threshold', 'expiry', 'initial_stock'
        ])

        for p in products:
            expiry = p.custom_fields.get('expiry', '') if p.custom_fields else ''
            initial_stock = p.custom_fields.get('initial_stock', p.current_stock) if p.custom_fields else p.current_stock
            writer.writerow([
                p.name,
                p.sku or '',
                p.cost_price,
                p.selling_price,
                p.current_stock,
                p.low_stock_threshold,
                expiry,
                initial_stock,
            ])

        log_action(
            shop=shop,
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
        writer.writerow([
            'name', 'SKU (Barcode)', 'cost_price', 'selling_price',
            'current_stock', 'Low Stock Threshold', 'expiry', 'initial_stock'
        ])
        return response