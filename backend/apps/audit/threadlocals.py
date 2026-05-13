import threading

_thread_locals = threading.local()


def set_request(request):
    """Store request object in thread locals."""
    _thread_locals.request = request


def get_request():
    """Retrieve request object from thread locals."""
    return getattr(_thread_locals, 'request', None)


def clear_request():
    """Remove request object from thread locals."""
    if hasattr(_thread_locals, 'request'):
        del _thread_locals.request