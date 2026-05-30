from django.shortcuts import redirect

class SubscriptionRequiredMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.user.is_authenticated and not request.user.is_superuser:
            shop = request.user.shop
            if shop:
                sub = getattr(shop, 'subscription', None)
                # Redirect if no subscription OR subscription is NOT active
                if not sub or not sub.is_active:
                    exempt_urls = ['/subscription', '/api/subscriptions/', '/logout']
                    if not any(request.path.startswith(url) for url in exempt_urls):
                        return redirect('/subscription')
        return self.get_response(request)