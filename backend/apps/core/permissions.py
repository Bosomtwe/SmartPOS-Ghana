from rest_framework import permissions

class IsOwnerOrCashierReadOnly(permissions.BasePermission):
    """
    Custom permission:
    - Owners can do anything.
    - Cashiers can only read.
    """
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.role == 'OWNER'

    def has_object_permission(self, request, view, obj):
        if request.method in permissions.SAFE_METHODS:
            return True
        return request.user.role == 'OWNER'