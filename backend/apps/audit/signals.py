# apps/audit/signals.py
from django.db.models.signals import post_save, post_delete
from django.dispatch import receiver
from apps.products.models import Product
from apps.customers.models import Customer
from .utils import log_action
from .threadlocals import get_request
from .models import AuditLog


# ---------- Product signals ----------
@receiver(post_save, sender=Product)
def log_product_change(sender, instance, created, **kwargs):
    request = get_request()
    if not request or not request.user.is_authenticated:
        return
    action = AuditLog.ActionType.PRODUCT_CREATE if created else AuditLog.ActionType.PRODUCT_UPDATE
    details = {
        'product_id': str(instance.id),
        'product_name': instance.name,
        'sku': instance.sku,
    }
    # Price change detection (inside update)
    if not created:
        old_instance = instance.__class__.objects.filter(pk=instance.pk).first()
        if old_instance and old_instance.selling_price != instance.selling_price:
            log_action(
                shop=request.user.shop,
                user=request.user,
                action=AuditLog.ActionType.PRICE_CHANGE,
                details={
                    'product_id': str(instance.id),
                    'product_name': instance.name,
                    'old_price': str(old_instance.selling_price),
                    'new_price': str(instance.selling_price),
                },
                request=request
            )
    log_action(
        shop=request.user.shop,
        user=request.user,
        action=action,
        details=details,
        request=request
    )


@receiver(post_delete, sender=Product)
def log_product_delete(sender, instance, **kwargs):
    request = get_request()
    if request and request.user and request.user.is_authenticated:
        log_action(
            shop=request.user.shop,
            user=request.user,
            action=AuditLog.ActionType.PRODUCT_DELETE,
            details={
                'product_id': str(instance.id),
                'product_name': instance.name,
            },
            request=request
        )


# ---------- Customer signals ----------
@receiver(post_save, sender=Customer)
def log_customer_change(sender, instance, created, **kwargs):
    request = get_request()
    if request and request.user and request.user.is_authenticated:
        action = AuditLog.ActionType.CUSTOMER_CREATE if created else AuditLog.ActionType.CUSTOMER_UPDATE
        log_action(
            shop=request.user.shop,
            user=request.user,
            action=action,
            details={'customer_id': str(instance.id), 'name': instance.name},
            request=request
        )


@receiver(post_delete, sender=Customer)
def log_customer_delete(sender, instance, **kwargs):
    request = get_request()
    if request and request.user and request.user.is_authenticated:
        log_action(
            shop=request.user.shop,
            user=request.user,
            action=AuditLog.ActionType.CUSTOMER_DELETE,
            details={'customer_id': str(instance.id), 'name': instance.name},
            request=request
        )


# ---------- Login / Logout are now handled in token_views.py ----------
# No signal handlers for user_logged_in or user_logged_out.
# (Remove or comment them out as done here.)