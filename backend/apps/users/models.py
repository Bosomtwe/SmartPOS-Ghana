from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager
from apps.core.models import BaseModel
import threading
import logging

logger = logging.getLogger(__name__)
_thread_local = threading.local()

class UserManager(BaseUserManager):
    def create_user(self, phone, password=None, **extra_fields):
        if not phone:
            raise ValueError('The Phone number must be set')
        user = self.model(phone=phone, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'OWNER')
        return self.create_user(phone, password, **extra_fields)


class Shop(BaseModel):
    name = models.CharField(max_length=255)
    owner = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, related_name='owned_shops')
    address = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    skip_auto_reactivation = models.BooleanField(default=False)

    def save(self, *args, **kwargs):
        # Store previous value for signal logging
        if self.pk:
            self._previous_is_active = Shop.objects.filter(pk=self.pk).values_list('is_active', flat=True).first()
        else:
            self._previous_is_active = None

        # If admin override flag is set, mark that this shop should never be auto‑reactivated
        if getattr(_thread_local, 'admin_override', False):
            self.skip_auto_reactivation = True
            logger.info(f"[Shop.save] Admin override set → skip_auto_reactivation=True for shop {self.id}")

        super().save(*args, **kwargs)

        # Log if is_active changed
        if self._previous_is_active is not None and self._previous_is_active != self.is_active:
            logger.warning(f"⚠️ Shop {self.id} is_active changed: {self._previous_is_active} → {self.is_active} (save)")

    def __str__(self):
        return self.name


class User(AbstractUser, BaseModel):
    ROLE_CHOICES = (
        ('OWNER', 'Owner'),
        ('CASHIER', 'Cashier'),
    )
    username = None
    phone = models.CharField(max_length=15, unique=True)
    shop = models.ForeignKey(Shop, on_delete=models.CASCADE, related_name='users', null=True, blank=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='CASHIER')
    is_active = models.BooleanField(default=True)
    email = models.EmailField(blank=True, null=True, unique=True)

    objects = UserManager()

    USERNAME_FIELD = 'phone'
    REQUIRED_FIELDS = []

    def __str__(self):
        return f"{self.phone} ({self.role})"


# Helper functions for thread-local flag
def set_admin_override(active: bool):
    _thread_local.admin_override = active
    logger.debug(f"[Admin override] set to {active}")

def clear_admin_override():
    if hasattr(_thread_local, 'admin_override'):
        del _thread_local.admin_override
        logger.debug("[Admin override] cleared")