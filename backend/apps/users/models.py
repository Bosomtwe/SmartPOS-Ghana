from django.db import models
from django.contrib.auth.models import AbstractUser, BaseUserManager
from apps.core.models import BaseModel

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
        # ✅ Force role = OWNER for any superuser
        extra_fields.setdefault('role', 'OWNER')
        return self.create_user(phone, password, **extra_fields)


class Shop(BaseModel):
    name = models.CharField(max_length=255)
    owner = models.ForeignKey('User', on_delete=models.SET_NULL, null=True, related_name='owned_shops')
    address = models.TextField(blank=True)

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