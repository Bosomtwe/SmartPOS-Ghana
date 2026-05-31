from django.db.models.signals import post_save
from django.dispatch import receiver
from .models import Shop
import logging

logger = logging.getLogger(__name__)

@receiver(post_save, sender=Shop)
def log_shop_is_active_change(sender, instance, created, **kwargs):
    if not created and hasattr(instance, '_previous_is_active'):
        if instance._previous_is_active != instance.is_active:
            logger.warning(f"🔔 SIGNAL: Shop {instance.id} is_active changed from {instance._previous_is_active} to {instance.is_active}")