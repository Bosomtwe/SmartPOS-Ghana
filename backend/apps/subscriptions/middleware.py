from django.shortcuts import redirect
import logging

logger = logging.getLogger(__name__)

class SubscriptionRequiredMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated and not request.user.is_superuser:
            shop = request.user.shop
            if shop:
                # Log current state
                logger.info(f"[Middleware] Shop {shop.id} is_active before = {shop.is_active}, skip_auto_reactivation={shop.skip_auto_reactivation}")

                # If manually skipped, do NOT redirect or change status
                if shop.skip_auto_reactivation:
                    logger.warning(f"[Middleware] Shop {shop.id} has skip_auto_reactivation=True → bypassing redirect")
                    return self.get_response(request)

                sub = getattr(shop, 'subscription', None)
                # Redirect if no subscription OR subscription is NOT active
                if not sub or not sub.is_active:
                    exempt_urls = ['/subscription', '/api/subscriptions/', '/logout']
                    if not any(request.path.startswith(url) for url in exempt_urls):
                        logger.warning(f"[Middleware] Redirecting shop {shop.id} to /subscription")
                        return redirect('/subscription')
                else:
                    # Ensure shop is active (but only if not manually skipped)
                    if not shop.is_active:
                        logger.warning(f"[Middleware] Auto-reactivated shop {shop.id} because subscription is active")
                        shop.is_active = True
                        shop.save(update_fields=['is_active'])
        return self.get_response(request)