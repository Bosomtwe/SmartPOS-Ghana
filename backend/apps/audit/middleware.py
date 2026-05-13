import logging
from django.utils.deprecation import MiddlewareMixin

logger = logging.getLogger(__name__)


class AuditMiddleware(MiddlewareMixin):
    """
    Middleware to attach request information to audit log entries.
    Must be placed after AuthenticationMiddleware.
    """

    def process_request(self, request):
        # Store request info in thread-local for access in signals
        from apps.audit.threadlocals import set_request   # ✅ fixed import
        set_request(request)

    def process_response(self, request, response):
        # Clean up after response
        from apps.audit.threadlocals import clear_request   # ✅ fixed import
        clear_request()
        return response