import requests
import json
import hmac
import hashlib
from datetime import timedelta
from django.conf import settings
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from django.http import JsonResponse
from django.shortcuts import redirect
from rest_framework.views import APIView
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated, BasePermission, AllowAny
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404

from .models import SubscriptionPlan, ShopSubscription
from .serializers import SubscriptionPlanSerializer, ShopSubscriptionSerializer
from apps.users.models import Shop

PAYSTACK_SECRET_KEY = settings.PAYSTACK_SECRET_KEY
PAYSTACK_PUBLIC_KEY = settings.PAYSTACK_PUBLIC_KEY

# ================ SUPERUSER PERMISSION ================
class IsSuperUser(BasePermission):
    def has_permission(self, request, view):
        return request.user and request.user.is_superuser

# ================ PUBLIC / SHOP ENDPOINTS ================
class SubscriptionPlansView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        plans = SubscriptionPlan.objects.filter(is_active=True, is_trial_plan=False)
        serializer = SubscriptionPlanSerializer(plans, many=True)
        return Response(serializer.data)


class CurrentSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sub = getattr(request.user.shop, 'subscription', None)
        if sub:
            serializer = ShopSubscriptionSerializer(sub)
            return Response(serializer.data)
        return Response(None)


class InitializePaymentView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        plan_id = request.data.get('plan_id')
        if not plan_id:
            raise ValidationError("plan_id required")

        plan = SubscriptionPlan.objects.get(id=plan_id, is_active=True)
        shop = request.user.shop
        email = request.user.email or f"shop_{shop.id}@smartpos.com"

        headers = {"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}", "Content-Type": "application/json"}

        # Create or retrieve customer
        cust_resp = requests.post(
            "https://api.paystack.co/customer",
            headers=headers,
            json={"email": email, "metadata": {"shop_id": str(shop.id)}}
        )
        cust_data = cust_resp.json()
        if not cust_data.get('status'):
            return Response({"error": "Failed to create customer"}, status=400)

        # ✅ Use HTTP callback in development, HTTPS in production
        if settings.DEBUG:
            callback_url = "http://localhost:8000/api/v1/subscriptions/verify/"
        else:
            callback_url = request.build_absolute_uri('/api/v1/subscriptions/verify/')

        init_data = {
            "email": email,
            "amount": int(plan.price * 100),
            # "plan": plan.paystack_plan_code,   # one‑time payment
            "callback_url": callback_url,
            "channels": ["mobile_money"],        # Mobile Money only
            "metadata": {
                "plan_id": str(plan.id),
                "shop_id": str(shop.id),
                "plan_name": plan.name
            }
        }
        init_resp = requests.post(
            "https://api.paystack.co/transaction/initialize",
            headers=headers,
            json=init_data
        )
        init_resp.raise_for_status()
        result = init_resp.json()
        if not result.get('status'):
            return Response({"error": "Payment initialization failed"}, status=400)

        request.session['paystack_ref'] = result['data']['reference']

        return Response({
            "authorization_url": result['data']['authorization_url'],
            "reference": result['data']['reference']
        })


class VerifyPaymentView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        reference = request.query_params.get('reference')
        if not reference:
            return redirect(f'{settings.FRONTEND_URL}/login?payment=error&message=Missing reference')

        headers = {"Authorization": f"Bearer {PAYSTACK_SECRET_KEY}"}
        verify_url = f"https://api.paystack.co/transaction/verify/{reference}"
        resp = requests.get(verify_url, headers=headers)
        data = resp.json()

        if not data.get('status') or data['data']['status'] != 'success':
            return redirect(f'{settings.FRONTEND_URL}/login?payment=error&message=Payment verification failed')

        metadata = data['data']['metadata']
        plan_id = metadata.get('plan_id')
        shop_id = metadata.get('shop_id')

        try:
            shop = Shop.objects.get(id=shop_id)
        except Shop.DoesNotExist:
            return redirect(f'{settings.FRONTEND_URL}/login?payment=error&message=Shop not found')

        plan = SubscriptionPlan.objects.get(id=plan_id)

        # Manual extension (same logic as webhook)
        sub, created = ShopSubscription.objects.get_or_create(
            shop=shop,
            defaults={
                'plan': plan,
                'start_date': timezone.now(),
                'end_date': timezone.now() + timedelta(days=plan.duration_days),
                'is_trial': False,
                'paystack_transaction_ref': reference,
                'paystack_customer_code': data['data']['customer']['customer_code'],
                'auto_renew': False,
            }
        )
        if not created:
            new_end = max(sub.end_date, timezone.now()) + timedelta(days=plan.duration_days)
            sub.end_date = new_end
            sub.plan = plan
            sub.paystack_transaction_ref = reference
            sub.paystack_customer_code = data['data']['customer']['customer_code']
            sub.is_trial = False
            sub.save()

        # ✅ Redirect to frontend login page with success message
        # (The user will log in again on the same domain where the token is stored)
        return redirect(f'{settings.FRONTEND_URL}/login?payment=success&message=Subscription activated. Please log in.')


class TrialActivationView(APIView):
    """Start a 14‑day free trial with ALL features unlimited"""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        shop = request.user.shop
        if hasattr(shop, 'subscription') and shop.subscription.is_active:
            return Response({"error": "Already subscribed"}, status=400)

        trial_plan, created = SubscriptionPlan.objects.get_or_create(
            is_trial_plan=True,
            defaults={
                "name": "Free Trial",
                "duration_days": 14,
                "price": 0,
                "max_users": 9999,
                "max_products": 999999,
                "allow_credit_sales": True,
                "allow_bulk_import": True,
                "allow_audit_logs": True,
                "allow_analytics": True,
                "is_active": True,
                "is_trial_plan": True,
            }
        )
        if not created:
            trial_plan.max_users = 9999
            trial_plan.max_products = 999999
            trial_plan.allow_credit_sales = True
            trial_plan.allow_bulk_import = True
            trial_plan.allow_audit_logs = True
            trial_plan.allow_analytics = True
            trial_plan.save()

        start_date = timezone.now()
        end_date = start_date + timedelta(days=trial_plan.duration_days)

        ShopSubscription.objects.update_or_create(
            shop=shop,
            defaults={
                "plan": trial_plan,
                "start_date": start_date,
                "end_date": end_date,
                "is_trial": True,
                "auto_renew": False,
            }
        )
        return Response({"status": "trial_started", "expires": end_date})


# ================ PAYSTACK WEBHOOK HANDLER ================
@csrf_exempt
@require_POST
def paystack_webhook(request):
    """Handle charge.success – manually extend subscription (one‑time payment)."""
    secret = PAYSTACK_SECRET_KEY
    signature = request.headers.get('x-paystack-signature')

    # Temporary bypass for manual testing (remove in production)
    if signature is not None:
        computed = hmac.new(secret.encode('utf-8'), request.body, hashlib.sha512).hexdigest()
        if not hmac.compare_digest(computed, signature):
            return JsonResponse({'error': 'Invalid signature'}, status=401)

    event = json.loads(request.body)
    if event['event'] == 'charge.success':
        data = event['data']
        reference = data['reference']
        metadata = data.get('metadata', {})
        plan_id = metadata.get('plan_id')
        shop_id = metadata.get('shop_id')
        customer_code = data['customer']['customer_code']

        if not plan_id or not shop_id:
            return JsonResponse({'error': 'Missing metadata'}, status=400)

        try:
            shop = Shop.objects.get(id=shop_id)
            plan = SubscriptionPlan.objects.get(id=plan_id)
        except (Shop.DoesNotExist, SubscriptionPlan.DoesNotExist):
            return JsonResponse({'error': 'Shop or Plan not found'}, status=404)

        # Manual extension: add plan.duration_days to current end_date
        sub, created = ShopSubscription.objects.get_or_create(
            shop=shop,
            defaults={
                'plan': plan,
                'start_date': timezone.now(),
                'end_date': timezone.now() + timedelta(days=plan.duration_days),
                'is_trial': False,
                'paystack_transaction_ref': reference,
                'paystack_customer_code': customer_code,
                'auto_renew': False,
            }
        )
        if not created:
            new_end = max(sub.end_date, timezone.now()) + timedelta(days=plan.duration_days)
            sub.end_date = new_end
            sub.plan = plan
            sub.paystack_transaction_ref = reference
            sub.paystack_customer_code = customer_code
            sub.is_trial = False
            sub.save()

    return JsonResponse({'status': 'success'})


# ================ ADMIN VIEWS (superuser only) ================
class AdminSubscriptionListView(generics.ListAPIView):
    permission_classes = [IsSuperUser]
    serializer_class = ShopSubscriptionSerializer
    queryset = ShopSubscription.objects.select_related('shop__owner', 'plan').all().order_by('-created_at')


class AdminSubscriptionUpdateView(generics.UpdateAPIView):
    permission_classes = [IsSuperUser]
    serializer_class = ShopSubscriptionSerializer
    queryset = ShopSubscription.objects.all()
    lookup_field = 'pk'


class AdminSubscriptionActivateView(APIView):
    permission_classes = [IsSuperUser]

    def post(self, request, shop_id):
        shop = get_object_or_404(Shop, id=shop_id)
        plan_id = request.data.get('plan_id')
        days = request.data.get('days', 30)
        is_trial = request.data.get('is_trial', False)

        if not plan_id:
            raise ValidationError({"plan_id": "This field is required."})

        plan = get_object_or_404(SubscriptionPlan, id=plan_id, is_active=True)
        start_date = timezone.now()
        end_date = start_date + timedelta(days=days)

        sub, created = ShopSubscription.objects.update_or_create(
            shop=shop,
            defaults={
                'plan': plan,
                'start_date': start_date,
                'end_date': end_date,
                'is_trial': is_trial,
                'auto_renew': False,
            }
        )
        serializer = ShopSubscriptionSerializer(sub)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdminPlanListView(generics.ListAPIView):
    permission_classes = [IsSuperUser]
    serializer_class = SubscriptionPlanSerializer
    queryset = SubscriptionPlan.objects.filter(is_active=True)