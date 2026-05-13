# customers/views.py
from rest_framework import generics, permissions, status, serializers
from rest_framework.response import Response
from django.db import transaction, IntegrityError
from django.db.models import Sum, Q, F, DecimalField
from django.db.models.functions import Coalesce
from django.shortcuts import get_object_or_404
from .models import Customer, CreditTransaction
from .serializers import CustomerSerializer, CreditTransactionSerializer
from ..core.permissions import IsOwnerOrCashierReadOnly
from apps.audit.utils import log_action
from apps.sales.models import Sale
from apps.sales.serializers import SaleSerializer
from decimal import Decimal


class CustomerListCreateView(generics.ListCreateAPIView):
    serializer_class = CustomerSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly]

    def get_queryset(self):
        return Customer.objects.filter(shop=self.request.user.shop)

    def perform_create(self, serializer):
        serializer.save(shop=self.request.user.shop)


class CustomerDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CustomerSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrCashierReadOnly]

    def get_queryset(self):
        return Customer.objects.filter(shop=self.request.user.shop)

    def perform_destroy(self, instance):
        if instance.transactions.exists():
            raise serializers.ValidationError(
                "Cannot delete customer with existing credit transactions. "
                "Clear all debts first or contact support."
            )
        instance.delete()


class RecordPaymentView(generics.GenericAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, customer_id):
        customer = get_object_or_404(Customer, id=customer_id, shop=request.user.shop)

        amount_raw = request.data.get('amount')
        note = request.data.get('note', '')
        sale_id = request.data.get('sale_id')
        idempotency_key = request.data.get('idempotency_key')

        if not amount_raw:
            return Response({'error': 'Amount required'}, status=400)
        try:
            amount = Decimal(str(amount_raw))
        except (ValueError, TypeError):
            return Response({'error': 'Invalid amount'}, status=400)
        if amount <= 0:
            return Response({'error': 'Amount must be positive'}, status=400)

        with transaction.atomic():
            # Idempotency check – if the transaction already exists, return success
            if idempotency_key:
                existing_tx = CreditTransaction.objects.filter(idempotency_key=idempotency_key).first()
                if existing_tx:
                    return Response({
                        'status': 'ok',
                        'new_balance': customer.total_credit,
                        'note': 'Already synced'
                    })

            if sale_id:
                # Targeted payment – single sale
                sale = get_object_or_404(
                    Sale.objects.select_for_update(),
                    id=sale_id,
                    shop=request.user.shop,
                    customer_id=customer.id,
                    payment_method='CREDIT',
                    status='COMPLETED'
                )
                paid_so_far = CreditTransaction.objects.filter(
                    sale=sale, type='PAYMENT'
                ).aggregate(total=Sum('amount'))['total'] or 0
                outstanding = sale.total_amount - abs(paid_so_far)
                if amount > outstanding:
                    return Response(
                        {'error': f'Amount exceeds outstanding for this sale (GHS {outstanding:.2f})'},
                        status=400
                    )

                balance_before = customer.total_credit
                new_balance = customer.total_credit - amount
                if new_balance < 0:
                    new_balance = Decimal('0.00')

                customer.total_credit = new_balance
                customer.save(update_fields=['total_credit'])

                try:
                    credit_tx = CreditTransaction.objects.create(
                        customer=customer,
                        sale=sale,
                        type='PAYMENT',
                        amount=-amount,
                        balance_after=new_balance,
                        note=note,
                        idempotency_key=idempotency_key,
                    )
                except IntegrityError:
                    # duplicate idempotency key; fetch existing transaction
                    credit_tx = CreditTransaction.objects.get(idempotency_key=idempotency_key)

                log_action(
                    shop=request.user.shop,
                    user=request.user,
                    action='CREDIT_PAYMENT',
                    details={
                        'customer_id': str(customer.id),
                        'customer_name': customer.name,
                        'amount': str(amount),
                        'balance_before': str(balance_before),
                        'balance_after': str(new_balance),
                        'note': note,
                        'sale_id': str(sale.id),
                    },
                    request=request
                )

                return Response({
                    'status': 'ok',
                    'new_balance': customer.total_credit,
                    'transaction_id': credit_tx.id,
                })

            else:
                # General payment – auto-allocate to oldest unpaid sales
                outstanding_sales = Sale.objects.filter(
                    customer=customer,
                    shop=request.user.shop,
                    status='COMPLETED',
                    payment_method='CREDIT'
                ).annotate(
                    total_paid=Coalesce(
                        Sum('credittransaction__amount',
                            filter=Q(credittransaction__type='PAYMENT')),
                        Decimal('0.00')
                    ) * Decimal('-1')
                ).filter(
                    total_paid__lt=F('total_amount')
                ).order_by('created_at')

                if not outstanding_sales.exists():
                    return Response({'error': 'No outstanding credit sales to apply payment to.'}, status=400)

                balance_before = customer.total_credit
                remaining = amount
                txs = []
                running_balance = customer.total_credit

                for sale in outstanding_sales:
                    if remaining <= 0:
                        break

                    paid_so_far = sale.total_paid or Decimal('0.00')
                    outstanding = sale.total_amount - paid_so_far

                    if outstanding <= 0:
                        continue

                    applied = min(remaining, outstanding)
                    remaining -= applied
                    running_balance -= applied

                    try:
                        tx = CreditTransaction.objects.create(
                            customer=customer,
                            sale=sale,
                            type='PAYMENT',
                            amount=-applied,
                            balance_after=running_balance,
                            note=note or f'General payment (auto-allocated to sale {sale.id})',
                            idempotency_key=None,  # general payments don't have idempotency keys
                        )
                    except IntegrityError:
                        # extremely unlikely, but just in case
                        continue
                    txs.append(tx)

                customer.total_credit = running_balance
                customer.save(update_fields=['total_credit'])

                log_action(
                    shop=request.user.shop,
                    user=request.user,
                    action='CREDIT_PAYMENT',
                    details={
                        'customer_id': str(customer.id),
                        'customer_name': customer.name,
                        'amount': str(amount),
                        'balance_before': str(balance_before),
                        'balance_after': str(running_balance),
                        'note': note,
                        'sales_paid': [str(tx.sale.id) for tx in txs],
                    },
                    request=request
                )

                return Response({
                    'status': 'ok',
                    'new_balance': customer.total_credit,
                    'allocated_to_sales': len(txs),
                })


class CustomerTransactionsView(generics.ListAPIView):
    serializer_class = CreditTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        customer_id = self.kwargs['pk']
        return CreditTransaction.objects.filter(
            customer_id=customer_id,
            customer__shop=self.request.user.shop
        ).order_by('-created_at')


class CustomerOutstandingSalesView(generics.ListAPIView):
    serializer_class = SaleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        customer_id = self.kwargs['customer_id']
        qs = Sale.objects.filter(
            customer_id=customer_id,
            shop=self.request.user.shop,
            status='COMPLETED',
            payment_method='CREDIT'
        ).annotate(
            total_paid=Coalesce(
                Sum('credittransaction__amount',
                    filter=Q(credittransaction__type='PAYMENT')),
                Decimal('0.00')
            ) * Decimal('-1')
        ).exclude(total_paid__gte=F('total_amount'))
        return qs