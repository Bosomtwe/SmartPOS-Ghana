from datetime import datetime, timedelta
from django.utils import timezone


class DateRangeMixin:
    def get_date_range(self, request):
        """Extract start/end from query params, default to last 30 days.
        Returns (start, end) or (None, None) if dates are malformed.
        """
        end_str = request.query_params.get('end_date')
        start_str = request.query_params.get('start_date')

        try:
            end = (
                datetime.strptime(end_str, '%Y-%m-%d').date()
                if end_str
                else timezone.now().date()
            )
            start = (
                datetime.strptime(start_str, '%Y-%m-%d').date()
                if start_str
                else end - timedelta(days=30)
            )
        except (ValueError, TypeError):
            # Invalid date format → return None so views can respond 400
            return None, None

        return start, end