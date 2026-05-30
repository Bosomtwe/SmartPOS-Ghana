from rest_framework.permissions import BasePermission


class HasSubscriptionFeature(BasePermission):
    """
    Grants permission for ANY feature if the shop's subscription is active.
    Superusers bypass all subscription checks.
    """
    def has_permission(self, request, view):
        # ✅ Superusers always have access
        if request.user and request.user.is_superuser:
            return True

        if not request.user or not request.user.is_authenticated:
            return False
        shop = request.user.shop
        if not shop or not hasattr(shop, 'subscription'):
            return False
        return shop.subscription.is_active


class MaxUsersPermission(BasePermission):
    """
    No user limit – always returns True if the subscription is active.
    Superusers bypass all checks.
    """
    def has_permission(self, request, view):
        # ✅ Superusers always have access
        if request.user and request.user.is_superuser:
            return True

        shop = request.user.shop
        if not shop or not hasattr(shop, 'subscription'):
            return False
        return shop.subscription.is_active


class MaxProductsPermission(BasePermission):
    """
    No product limit – always returns True if the subscription is active.
    Superusers bypass all checks.
    """
    def has_permission(self, request, view):
        # ✅ Superusers always have access
        if request.user and request.user.is_superuser:
            return True

        shop = request.user.shop
        if not shop or not hasattr(shop, 'subscription'):
            return False
        return shop.subscription.is_active