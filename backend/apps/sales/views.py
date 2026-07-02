# apps/sales/views.py
import logging
from datetime import datetime
from rest_framework import generics, status, permissions, serializers
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from django.db import transaction, IntegrityError
from django.db.models import Sum, Q, F, DecimalField
from django.db.models.functions import Coalesce
from django.core.cache import cache
from django.utils import timezone
from .models import Sale, SaleItem
from .serializers import SaleSerializer
from apps.products.models import Product, InventoryTransaction
from apps.audit.models import AuditLog
from apps.audit.utils import log_action
from decimal import Decimal

# ✅ Import subscription permission
from apps.subscriptions.permissions import HasSubscriptionFeature

logger = logging.getLogger(__name__)


def _create_sale_from_data(*, shop, user, customer_id, total_amount, discount,
                           payment_method, items, ip_address, sale_id=None,
                           idempotency_key=None, momo_number='', request=None,
                           created_at=None, is_backdated=False, original_created_at=None):
    total_amount = Decimal(str(total_amount))
    discount = Decimal(str(discount)) if discount else Decimal('0.00')

    if not items:
        raise serializers.ValidationError("Sale must have at least one item.")

    # Idempotency checks
    if idempotency_key:
        try:
            existing_sale = Sale.objects.get(idempotency_key=idempotency_key, shop=shop)
            return existing_sale
        except Sale.DoesNotExist:
            pass

        if payment_method == 'CREDIT':
            from apps.customers.models import CreditTransaction
            try:
                existing_tx = CreditTransaction.objects.get(idempotency_key=idempotency_key)
                if existing_tx.sale:
                    return existing_tx.sale
            except CreditTransaction.DoesNotExist:
                pass

    with transaction.atomic():
        product_ids = [item['product'] for item in items]
        raw_products = Product.objects.select_for_update().filter(
            id__in=product_ids, shop=shop
        ).in_bulk()
        products = {str(pk): product for pk, product in raw_products.items()}

        if len(products) != len(set(product_ids)):
            missing = set(product_ids) - set(products.keys())
            raise serializers.ValidationError(f"Products not found: {missing}")

        for item in items:
            product = products[item['product']]
            if product.current_stock < item['quantity']:
                raise serializers.ValidationError(f"Insufficient stock for {product.name}")

        # Credit validation
        if payment_method == 'CREDIT' and customer_id:
            from apps.customers.models import Customer
            try:
                customer = Customer.objects.select_for_update().get(
                    id=customer_id, shop=shop
                )
            except Customer.DoesNotExist:
                raise serializers.ValidationError("Customer not found")
            if customer.credit_limit is not None:
                new_credit = customer.total_credit + total_amount
                if new_credit > customer.credit_limit:
                    raise serializers.ValidationError(
                        f"Credit limit exceeded for {customer.name} "
                        f"(limit: {customer.credit_limit})"
                    )

        kwargs = dict(
            shop=shop,
            user=user,
            customer_id=customer_id,
            total_amount=total_amount,
            discount=discount,
            payment_method=payment_method,
            momo_number=momo_number,
            status='COMPLETED',
            idempotency_key=idempotency_key,
            is_backdated=is_backdated,
            original_created_at=original_created_at,
        )
        if created_at:
            kwargs['created_at'] = created_at
            logger.info(f"[Backdating] Setting created_at to {created_at} for sale {sale_id or 'new'}")

        try:
            if sale_id:
                sale = Sale(id=sale_id, **kwargs)
                sale.save(force_insert=True)
                if created_at:
                    Sale.objects.filter(pk=sale.pk).update(created_at=created_at)
                    logger.info(f"[Backdating] Updated created_at to {created_at} for sale {sale.id}")
            else:
                sale = Sale.objects.create(**kwargs)
                # ✅ FIX: Update created_at after creation if provided
                if created_at:
                    Sale.objects.filter(pk=sale.pk).update(created_at=created_at)
                    logger.info(f"[Backdating] Created sale {sale.id} with backdated created_at={created_at}")
                else:
                    logger.info(f"[Backdating] Created sale {sale.id} with created_at={sale.created_at}")
        except IntegrityError:
            sale = Sale.objects.get(idempotency_key=idempotency_key, shop=shop)
            return sale

        sale_items = []
        inventory_transactions = []

        for item in items:
            product = products[item['product']]
            unit_price = Decimal(str(item.get('unit_price', product.selling_price)))
            quantity = item['quantity']
            item_total = unit_price * quantity

            sale_items.append(SaleItem(
                sale=sale,
                product=product,
                quantity=quantity,
                unit_price=unit_price,
                total=item_total
            ))

            old_stock = product.current_stock
            new_stock = old_stock - quantity
            product.current_stock = new_stock
            inventory_transactions.append(InventoryTransaction(
                product=product,
                user=user,
                type='SALE',
                quantity=-quantity,
                previous_quantity=old_stock,
                new_quantity=new_stock,
                reason=f"Sale {sale.id}"
            ))

        SaleItem.objects.bulk_create(sale_items)
        InventoryTransaction.objects.bulk_create(inventory_transactions)
        Product.objects.bulk_update(products.values(), ['current_stock'])

        cache.delete(f'product_list_{shop.id}')

        if sale.payment_method == 'CREDIT' and sale.customer:
            from apps.customers.models import CreditTransaction
            try:
                CreditTransaction.objects.create(
                    customer=sale.customer,
                    sale=sale,
                    type='DEBT',
                    amount=sale.total_amount,
                    balance_after=sale.customer.total_credit + sale.total_amount,
                    note=f"Sale {sale.id}",
                    idempotency_key=idempotency_key
                )
            except IntegrityError:
                pass
            else:
                sale.customer.total_credit += sale.total_amount
                sale.customer.save()

        if is_backdated:
            log_action(
                shop=shop,
                user=user,
                action=AuditLog.ActionType.SALE_BACKDATED,
                details={
                    'sale_id': str(sale.id),
                    'original_created_at': original_created_at.isoformat() if original_created_at else None,
                    'backdated_to': created_at.isoformat() if created_at else None,
                },
                request=request
            )

        log_action(
            shop=shop,
            user=user,
            action=AuditLog.ActionType.SALE_CREATE,
            details={
                'sale_id': str(sale.id),
                'total_amount': str(sale.total_amount),
                'payment_method': sale.payment_method,
                'item_count': len(items),
                'is_backdated': is_backdated,
            },
            request=request
        )

        return sale


# ✅ Apply subscription feature gating for credit sales
class SaleCreateView(generics.CreateAPIView):
    serializer_class = SaleSerializer
    permission_classes = [permissions.IsAuthenticated, HasSubscriptionFeature]
    subscription_feature = 'allow_credit_sales'

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        if not serializer.is_valid():
            logger.error("SaleCreateView validation errors: %s", serializer.errors)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        return super().create(request, *args, **kwargs)

    @transaction.atomic
    def perform_create(self, serializer):
        data = self.request.data
        user = self.request.user

        created_at = None
        is_backdated = False
        original_created_at = None

        if user.role == 'OWNER' and data.get('created_at'):
            try:
                created_at = datetime.fromisoformat(data['created_at'].replace('Z', '+00:00'))
                is_backdated = True
                original_created_at = timezone.now()
                logger.info(f"[SaleCreateView] Received backdated timestamp: {created_at}")
            except ValueError:
                logger.warning(f"[SaleCreateView] Invalid created_at format: {data.get('created_at')}")

        sale = _create_sale_from_data(
            shop=self.request.user.shop,
            user=user,
            customer_id=data.get('customer'),
            total_amount=data.get('total_amount'),
            discount=data.get('discount', 0),
            payment_method=data.get('payment_method'),
            items=data.get('items', []),
            ip_address=self.request.META.get('REMOTE_ADDR'),
            idempotency_key=data.get('idempotency_key'),
            momo_number=data.get('momo_number', ''),
            request=self.request,
            created_at=created_at,
            is_backdated=is_backdated,
            original_created_at=original_created_at,
        )
        serializer.instance = sale


class SalesListPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class SaleListView(generics.ListAPIView):
    """
    List sales for the authenticated user's shop.
    - Cashiers see only their own sales.
    - Owners see all sales, and can filter by user_id.
    """
    serializer_class = SaleSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = SalesListPagination

    def get_queryset(self):
        user = self.request.user
        qs = Sale.objects.filter(shop=user.shop)

        # ✅ Cashiers: only their own sales
        if user.role == 'CASHIER':
            qs = qs.filter(user=user)
        else:
            # Owners: optional user_id filter
            user_id = self.request.query_params.get('user_id')
            if user_id:
                qs = qs.filter(user_id=user_id)

        # Date filters (unchanged)
        start_date = self.request.query_params.get('start_date')
        end_date = self.request.query_params.get('end_date')
        if start_date:
            qs = qs.filter(created_at__date__gte=start_date)
        if end_date:
            qs = qs.filter(created_at__date__lte=end_date)

        qs = qs.annotate(
            total_paid=Coalesce(
                Sum('credittransaction__amount',
                    filter=Q(credittransaction__type='PAYMENT')),
                Decimal('0.00')
            ) * Decimal('-1')
        )
        return qs.order_by('-created_at')


class SaleDetailView(generics.RetrieveAPIView):
    serializer_class = SaleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Sale.objects.filter(shop=self.request.user.shop)


class SaleVoidView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        sale = Sale.objects.get(pk=pk, shop=request.user.shop)
        if sale.status == 'VOIDED':
            return Response({'error': 'Sale already voided'},
                            status=status.HTTP_400_BAD_REQUEST)

        reason = request.data.get('reason')
        if not reason:
            return Response({'error': 'Void reason required'},
                            status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            sale.status = 'VOIDED'
            sale.void_reason = reason
            sale.save()

            for item in sale.items.all():
                product = item.product
                old_stock = product.current_stock
                new_stock = old_stock + item.quantity
                product.current_stock = new_stock
                product.save()

                InventoryTransaction.objects.create(
                    product=product,
                    user=request.user,
                    type='ADJUSTMENT',
                    quantity=item.quantity,
                    previous_quantity=old_stock,
                    new_quantity=new_stock,
                    reason=f"Void sale {sale.id}"
                )

            if sale.payment_method == 'CREDIT' and sale.customer:
                from apps.customers.models import CreditTransaction
                CreditTransaction.objects.create(
                    customer=sale.customer,
                    sale=sale,
                    type='PAYMENT',
                    amount=-sale.total_amount,
                    balance_after=sale.customer.total_credit - sale.total_amount,
                    note=f"Void sale {sale.id}"
                )
                sale.customer.total_credit -= sale.total_amount
                sale.customer.save()

            log_action(
                shop=request.user.shop,
                user=request.user,
                action=AuditLog.ActionType.SALE_VOID,
                details={'sale_id': str(sale.id), 'reason': reason},
                request=request
            )

            cache.delete(f'product_list_{request.user.shop.id}')

        return Response({'status': 'voided'})


class SyncSalesView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = None

    def post(self, request):
        sales_data = request.data
        if not isinstance(sales_data, list):
            return Response({'error': 'Expected list of sales'},
                            status=status.HTTP_400_BAD_REQUEST)

        results = []
        for sale_data in sales_data:
            client_id = sale_data.get('id')
            idemp_key = sale_data.get('idempotency_key')
            try:
                with transaction.atomic():
                    shop_from_client = sale_data.get('shop')
                    if shop_from_client and str(shop_from_client) != str(request.user.shop.id):
                        raise ValueError("Sale belongs to a different shop")

                    if client_id and Sale.objects.filter(id=client_id).exists():
                        results.append({
                            'sale_id': client_id,
                            'client_id': client_id,
                            'status': 'success',
                            'note': 'Already synced'
                        })
                        continue

                    if idemp_key:
                        existing_sale = Sale.objects.filter(idempotency_key=idemp_key).first()
                        if existing_sale:
                            results.append({
                                'sale_id': str(existing_sale.id),
                                'client_id': client_id,
                                'status': 'success',
                                'note': 'Already synced (idempotency key match)'
                            })
                            continue

                        from apps.customers.models import CreditTransaction
                        if CreditTransaction.objects.filter(idempotency_key=idemp_key).exists():
                            existing_tx = CreditTransaction.objects.filter(idempotency_key=idemp_key).first()
                            if existing_tx.sale:
                                results.append({
                                    'sale_id': str(existing_tx.sale.id),
                                    'client_id': client_id,
                                    'status': 'success',
                                    'note': 'Already synced (idempotency key match on credit tx)'
                                })
                                continue

                    created_at_str = sale_data.get('created_at')
                    created_at = None
                    is_backdated = False
                    original_created_at = None

                    if created_at_str:
                        try:
                            created_at = datetime.fromisoformat(created_at_str.replace('Z', '+00:00'))
                            if request.user.role == 'OWNER':
                                is_backdated = True
                                original_created_at = timezone.now()
                                logger.info(f"[SyncSalesView] Backdating sale {client_id} to {created_at}")
                            else:
                                logger.warning(f"[SyncSalesView] Cashier attempted backdating – ignored")
                        except ValueError:
                            logger.warning(f"[SyncSalesView] Invalid created_at format: {created_at_str}")

                    sale = _create_sale_from_data(
                        shop=request.user.shop,
                        user=request.user,
                        customer_id=sale_data.get('customer'),
                        total_amount=sale_data.get('total_amount'),
                        discount=sale_data.get('discount', 0),
                        payment_method=sale_data.get('payment_method'),
                        items=sale_data.get('items', []),
                        ip_address=request.META.get('REMOTE_ADDR'),
                        sale_id=client_id,
                        idempotency_key=idemp_key,
                        momo_number=sale_data.get('momo_number', ''),
                        request=request,
                        created_at=created_at,
                        is_backdated=is_backdated,
                        original_created_at=original_created_at,
                    )

                    results.append({
                        'sale_id': str(sale.id),
                        'client_id': client_id or str(sale.id),
                        'status': 'success',
                        'sale': SaleSerializer(sale).data,
                    })

            except Exception as e:
                logger.exception("Sync failed for sale data: %s", sale_data)
                error_message = str(e)
                if hasattr(e, 'messages'):
                    error_message = '; '.join(e.messages)
                results.append({
                    'client_id': client_id,
                    'sale_id': client_id,
                    'error': error_message,
                    'data': sale_data
                })

        return Response({'results': results})