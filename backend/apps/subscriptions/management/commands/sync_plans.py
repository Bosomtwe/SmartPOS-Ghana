# sync_plans.py
import requests
from django.core.management.base import BaseCommand
from django.conf import settings
from apps.subscriptions.models import SubscriptionPlan

class Command(BaseCommand):
    help = 'Sync local subscription plans with Paystack'

    def handle(self, *args, **options):
        headers = {"Authorization": f"Bearer {settings.PAYSTACK_SECRET_KEY}"}
        for plan in SubscriptionPlan.objects.all():
            # Check if plan exists on Paystack
            if not plan.paystack_plan_code:
                # Create a new plan on Paystack
                data = {
                    "name": plan.name,
                    "interval": "monthly",  # Adjust based on your plan's duration
                    "amount": int(plan.price * 100)  # Amount in kobo/pesewas
                }
                response = requests.post("https://api.paystack.co/plan", headers=headers, json=data)
                if response.status_code == 201:
                    plan.paystack_plan_code = response.json()['data']['plan_code']
                    plan.save()
                    self.stdout.write(self.style.SUCCESS(f'Created plan {plan.name}'))