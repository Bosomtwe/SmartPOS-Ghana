from .models import AuditLog
from .threadlocals import get_request


def _build_summary(action, details):
    """Create a plain-language sentence for the audit log."""
    product_name = details.get('product_name', 'unknown')
    sale_id = details.get('sale_id', '')
    customer_name = details.get('name', 'unknown')

    if action == AuditLog.ActionType.SALE_CREATE:
        return f"Created sale #{sale_id}"
    if action == AuditLog.ActionType.SALE_VOID:
        return f"Voided sale #{sale_id} — {details.get('reason', '')}"
    if action == AuditLog.ActionType.STOCK_ADJUST:
        return (
            f"Adjusted stock of '{product_name}' "
            f"from {details.get('old_stock')} to {details.get('new_stock')} "
            f"(reason: {details.get('reason', '')})"
        )
    if action == AuditLog.ActionType.PRODUCT_CREATE:
        return f"Created product '{product_name}'"
    if action == AuditLog.ActionType.PRODUCT_UPDATE:
        return f"Updated product '{product_name}'"
    if action == AuditLog.ActionType.PRODUCT_DELETE:
        return f"Deleted product '{product_name}'"
    if action == AuditLog.ActionType.PRICE_CHANGE:
        return (
            f"Changed price of '{product_name}' "
            f"from {details.get('old_price')} to {details.get('new_price')}"
        )
    if action == AuditLog.ActionType.CUSTOMER_CREATE:
        return f"Created customer '{customer_name}'"
    if action == AuditLog.ActionType.CUSTOMER_UPDATE:
        return f"Updated customer '{customer_name}'"
    if action == AuditLog.ActionType.CUSTOMER_DELETE:
        return f"Deleted customer '{customer_name}'"
    if action == AuditLog.ActionType.LOGIN:
        return "User logged in"
    if action == AuditLog.ActionType.LOGOUT:
        return "User logged out"
    if action == AuditLog.ActionType.BACKUP_DOWNLOAD:
        return "Downloaded backup"
    if action == AuditLog.ActionType.BACKUP_RESTORE:
        return "Restored data from backup"
    if action == AuditLog.ActionType.INVITE_CASHIER:
        return "Invited a new cashier"
    if action == AuditLog.ActionType.CREDIT_PAYMENT:
        return f"Credit payment recorded for customer '{customer_name}'"
    return ""  # fallback


def log_action(shop, user, action, details=None, request=None):
    """
    Helper function to create audit log entries.
    """
    if request is None:
        request = get_request()

    details = details or {}
    summary = _build_summary(action, details)

    log_entry = AuditLog.objects.create(
        shop=shop,
        user=user,
        action=action,
        details=details,
        summary=summary,
        ip_address=get_client_ip(request) if request else None,
        user_agent=request.META.get('HTTP_USER_AGENT', '')[:500] if request else '',
        request_path=request.path if request else '',
        http_method=request.method if request else '',
    )
    return log_entry


def get_client_ip(request):
    """Extract client IP address from request."""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip