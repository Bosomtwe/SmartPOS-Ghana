import uuid
from django.db import models
from django.utils import timezone
from apps.users.models import Shop
from apps.core.models import BaseModel

class SubscriptionPlan(BaseModel):
    """Available subscription plans"""
    name = models.CharField(max_length=50)  # Monthly, Quarterly, Yearly
    duration_days = models.IntegerField()   # 30, 90, 365
    price = models.DecimalField(max_digits=10, decimal_places=2)
    
    # Feature flags (now ignored by permissions – kept for admin/history)
    max_users = models.IntegerField(default=2)
    max_products = models.IntegerField(default=1000)
    allow_credit_sales = models.BooleanField(default=True)
    allow_bulk_import = models.BooleanField(default=True)
    allow_audit_logs = models.BooleanField(default=True)
    allow_analytics = models.BooleanField(default=False)
    
    is_active = models.BooleanField(default=True)
    is_trial_plan = models.BooleanField(default=False)
    
    # ✅ Paystack plan code (linked to Paystack plan)
    paystack_plan_code = models.CharField(max_length=100, blank=True, null=True)
    
    def __str__(self):
        return f"{self.name} – {self.price} GHS"

class ShopSubscription(BaseModel):
    """Active or expired subscription for a shop"""
    shop = models.OneToOneField(Shop, on_delete=models.CASCADE, related_name='subscription')
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT)
    start_date = models.DateTimeField(default=timezone.now)
    end_date = models.DateTimeField()
    is_trial = models.BooleanField(default=False)
    
    # Paystack references
    paystack_transaction_ref = models.CharField(max_length=255, blank=True, null=True)
    paystack_subscription_code = models.CharField(max_length=255, blank=True, null=True)
    paystack_customer_code = models.CharField(max_length=255, blank=True, null=True)
    auto_renew = models.BooleanField(default=False)
    
    @property
    def is_active(self) -> bool:
        return self.end_date > timezone.now()
    
    @property
    def days_remaining(self) -> int:
        delta = self.end_date - timezone.now()
        return max(0, delta.days)