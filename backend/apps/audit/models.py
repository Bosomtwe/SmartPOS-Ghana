from django.db import models
from django.contrib.auth import get_user_model
from apps.core.models import BaseModel
from apps.users.models import Shop

User = get_user_model()


class AuditLog(BaseModel):
    """
    Tracks all critical user actions across the system.
    """
    class ActionType(models.TextChoices):
        SALE_CREATE = 'SALE_CREATE', 'Sale Created'
        SALE_VOID = 'SALE_VOID', 'Sale Voided'
        PRICE_CHANGE = 'PRICE_CHANGE', 'Price Changed'
        STOCK_ADJUST = 'STOCK_ADJUST', 'Stock Adjusted'
        CREDIT_PAYMENT = 'CREDIT_PAYMENT', 'Credit Payment'
        PRODUCT_CREATE = 'PRODUCT_CREATE', 'Product Created'
        PRODUCT_UPDATE = 'PRODUCT_UPDATE', 'Product Updated'
        PRODUCT_DELETE = 'PRODUCT_DELETE', 'Product Deleted'
        CUSTOMER_CREATE = 'CUSTOMER_CREATE', 'Customer Created'
        CUSTOMER_UPDATE = 'CUSTOMER_UPDATE', 'Customer Updated'
        CUSTOMER_DELETE = 'CUSTOMER_DELETE', 'Customer Deleted'
        LOGIN = 'LOGIN', 'User Login'
        LOGIN_FAILED = 'LOGIN_FAILED', 'Login Failed'
        LOGOUT = 'LOGOUT', 'User Logout'
        BACKUP_DOWNLOAD = 'BACKUP_DOWNLOAD', 'Backup Downloaded'
        BACKUP_RESTORE = 'BACKUP_RESTORE', 'Backup Restored'
        INVITE_CASHIER = 'INVITE_CASHIER', 'Cashier Invited'

    shop = models.ForeignKey(
        Shop,
        on_delete=models.CASCADE,
        related_name='audit_logs',
        null=True,           # ← required for failed logins where shop is unknown
        blank=True,
    )
    user = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, related_name='audit_logs')
    action = models.CharField(max_length=30, choices=ActionType.choices)
    details = models.JSONField(default=dict, help_text="Additional context (e.g., old value, new value, reason)")
    summary = models.TextField(blank=True, help_text="Human-readable description of the action")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=500, blank=True)
    request_path = models.CharField(max_length=500, blank=True)
    http_method = models.CharField(max_length=10, blank=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['shop', '-created_at']),
            models.Index(fields=['action']),
            models.Index(fields=['user']),
            models.Index(fields=['created_at']),
            models.Index(fields=['action', 'created_at']),
        ]

    def __str__(self):
        return f"{self.get_action_display()} by {self.user} at {self.created_at}"