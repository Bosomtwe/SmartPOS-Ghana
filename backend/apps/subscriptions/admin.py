from django.contrib import admin
from .models import SubscriptionPlan, ShopSubscription

@admin.register(SubscriptionPlan)
class SubscriptionPlanAdmin(admin.ModelAdmin):
    list_display = ['name', 'price', 'duration_days', 'is_active', 'is_trial_plan']
    list_editable = ['price', 'is_active']

@admin.register(ShopSubscription)
class ShopSubscriptionAdmin(admin.ModelAdmin):
    list_display = ['shop', 'plan', 'start_date', 'end_date', 'is_trial', 'is_active']