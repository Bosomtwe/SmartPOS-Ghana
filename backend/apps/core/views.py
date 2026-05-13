import json
from uuid import UUID
from django.utils import timezone
from django.http import JsonResponse
from django.db import transaction
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser
from apps.products.models import Product
from apps.customers.models import Customer, CreditTransaction
from apps.sales.models import Sale, SaleItem
from apps.users.models import Shop, User
from apps.audit.utils import log_action
from apps.audit.models import AuditLog


class BackupDownloadView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        shop = request.user.shop

        # Products – flat list
        products = list(Product.objects.filter(shop=shop).values())

        # Customers – flat list
        customers = list(Customer.objects.filter(shop=shop).values())

        # Sales with nested items
        sales_qs = Sale.objects.filter(shop=shop).prefetch_related('items')
        sales = []
        for sale in sales_qs:
            sale_dict = {
                'id': str(sale.id),
                'shop_id': str(shop.id),
                'user_id': str(sale.user_id) if sale.user_id else None,
                'customer_id': str(sale.customer_id) if sale.customer_id else None,
                'total_amount': str(sale.total_amount),
                'discount': str(sale.discount),
                'payment_method': sale.payment_method,
                'momo_number': sale.momo_number,
                'status': sale.status,
                'void_reason': sale.void_reason,
                'created_at': sale.created_at.isoformat(),
            }
            items = []
            for item in sale.items.all():
                items.append({
                    'product_id': str(item.product_id) if item.product else None,
                    'quantity': item.quantity,
                    'unit_price': str(item.unit_price),
                    'total': str(item.total),
                })
            sale_dict['items'] = items
            sales.append(sale_dict)

        # Credit transactions
        credit_txs = list(
            CreditTransaction.objects.filter(customer__shop=shop).values()
        )

        data = {
            'shop': {
                'id': str(shop.id),
                'name': shop.name,
                'address': shop.address,
            },
            'products': products,
            'customers': customers,
            'sales': sales,
            'creditTransactions': credit_txs,
        }

        response = JsonResponse(data)
        response['Content-Disposition'] = 'attachment; filename="smartpos_backup.json"'

        log_action(
            shop=shop,
            user=request.user,
            action=AuditLog.ActionType.BACKUP_DOWNLOAD,
            details={'type': 'full_backup'},
            request=request,
        )
        return response


class BackupRestoreView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser]

    def post(self, request):
        shop = request.user.shop
        if request.user.role != 'OWNER':
            return Response(
                {'error': 'Only owners can restore backups'},
                status=status.HTTP_403_FORBIDDEN,
            )

        uploaded_file = request.FILES.get('file')
        if not uploaded_file:
            return Response(
                {'error': 'No backup file provided'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            data = json.load(uploaded_file)
        except json.JSONDecodeError:
            return Response(
                {'error': 'Invalid JSON file'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        required_tables = ['products', 'customers', 'sales']
        if any(k not in data for k in required_tables):
            return Response(
                {'error': 'Backup file is missing required tables'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            log_action(
                shop=shop,
                user=request.user,
                action=AuditLog.ActionType.BACKUP_RESTORE,
                details={'timestamp': timezone.now().isoformat()},
                request=request,
            )

            # 1. Clear existing data for this shop
            SaleItem.objects.filter(sale__shop=shop).delete()
            Sale.objects.filter(shop=shop).delete()
            CreditTransaction.objects.filter(customer__shop=shop).delete()
            Customer.objects.filter(shop=shop).delete()
            Product.objects.filter(shop=shop).delete()

            # 2. Restore products (preserve UUIDs)
            product_id_map = {}
            for prod_data in data['products']:
                prod_data = dict(prod_data)
                prod_data['shop_id'] = shop.id
                original_id_str = prod_data.get('id')
                if original_id_str:
                    try:
                        prod_data['id'] = UUID(str(original_id_str))
                    except (ValueError, TypeError):
                        # If invalid UUID, let Django auto‑generate
                        prod_data.pop('id', None)
                else:
                    prod_data.pop('id', None)
                product = Product.objects.create(**prod_data)
                product_id_map[original_id_str] = product

            # 3. Restore customers
            for cust_data in data['customers']:
                cust_data = dict(cust_data)
                cust_data['shop_id'] = shop.id
                original_id_str = cust_data.get('id')
                if original_id_str:
                    try:
                        cust_data['id'] = UUID(str(original_id_str))
                    except (ValueError, TypeError):
                        cust_data.pop('id', None)
                else:
                    cust_data.pop('id', None)
                Customer.objects.create(**cust_data)

            # 4. Restore sales + sale items
            for sale_data in data['sales']:
                items = sale_data.pop('items', [])
                sale_data = dict(sale_data)
                sale_data['shop_id'] = shop.id
                original_id_str = sale_data.get('id')
                if original_id_str:
                    try:
                        sale_data['id'] = UUID(str(original_id_str))
                    except (ValueError, TypeError):
                        sale_data.pop('id', None)
                else:
                    sale_data.pop('id', None)

                # Convert decimal fields back to numbers (JSON stores as strings)
                sale_data['total_amount'] = sale_data['total_amount']
                sale_data['discount'] = sale_data['discount']

                sale = Sale.objects.create(**sale_data)

                for item in items:
                    item = dict(item)
                    product_id = item.pop('product_id', None)
                    product = product_id_map.get(product_id)
                    if product:
                        item['product'] = product
                    SaleItem.objects.create(sale=sale, **item)

            # 5. Restore credit transactions
            if 'creditTransactions' in data:
                for tx_data in data['creditTransactions']:
                    tx_data = dict(tx_data)
                    customer_id = tx_data.pop('customer_id', None)
                    if customer_id:
                        try:
                            customer = Customer.objects.get(id=customer_id, shop=shop)
                            tx_data['customer'] = customer
                        except Customer.DoesNotExist:
                            continue
                    else:
                        continue

                    sale_id = tx_data.pop('sale_id', None)
                    if sale_id:
                        try:
                            sale = Sale.objects.get(id=sale_id, shop=shop)
                            tx_data['sale'] = sale
                        except Sale.DoesNotExist:
                            tx_data.pop('sale_id', None)
                            tx_data['sale'] = None

                    CreditTransaction.objects.create(**tx_data)

        return Response({'status': 'restored successfully'})