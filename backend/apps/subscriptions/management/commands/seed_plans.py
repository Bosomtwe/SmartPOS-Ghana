from django.core.management.base import BaseCommand
from apps.subscriptions.models import SubscriptionPlan

class Command(BaseCommand):
    help = 'Create subscription plans'

    def handle(self, *args, **options):
        plans = [
            {
                'name': 'Monthly',
                'duration_days': 30,
                'price': 80,
                'max_users': 5,
                'max_products': 5000,
                'allow_credit_sales': True,
                'allow_bulk_import': True,
                'allow_audit_logs': True,
                'is_trial_plan': False,
            },
            {
                'name': 'Quarterly',
                'duration_days': 90,
                'price': 210,
                'max_users': 5,
                'max_products': 5000,
                'allow_credit_sales': True,
                'allow_bulk_import': True,
                'allow_audit_logs': True,
                'is_trial_plan': False,
            },
            {
                'name': 'Yearly',
                'duration_days': 365,
                'price': 750,
                'max_users': 5,
                'max_products': 5000,
                'allow_credit_sales': True,
                'allow_bulk_import': True,
                'allow_audit_logs': True,
                'is_trial_plan': False,
            },
        ]
        for p in plans:
            obj, created = SubscriptionPlan.objects.get_or_create(name=p['name'], defaults=p)
            if created:
                self.stdout.write(self.style.SUCCESS(f'Created plan: {p["name"]}'))
            else:
                self.stdout.write(f'Plan already exists: {p["name"]}')