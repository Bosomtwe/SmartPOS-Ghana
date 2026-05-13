from django.test import TestCase
from apps.users.models import Shop, User
from apps.products.models import Product
from apps.customers.models import Customer
from apps.sales.views import _create_sale_from_data
from apps.audit.models import AuditLog


class SaleCreationTest(TestCase):
    def setUp(self):
        self.shop = Shop.objects.create(name="Test Shop")
        self.owner = User.objects.create_user(
            phone="0240000000", password="pass", role='OWNER', shop=self.shop
        )
        self.product = Product.objects.create(
            shop=self.shop,
            name="Test Product",
            cost_price=5,
            selling_price=10,
            current_stock=100,
        )

    def test_cash_sale_deducts_stock_and_logs_audit(self):
        sale = _create_sale_from_data(
            shop=self.shop,
            user=self.owner,
            customer_id=None,
            total_amount=30,
            discount=0,
            payment_method='CASH',
            items=[{'product': str(self.product.id), 'quantity': 3, 'unit_price': 10}],
            ip_address='127.0.0.1',
        )
        self.product.refresh_from_db()
        self.assertEqual(self.product.current_stock, 97)

        audit = AuditLog.objects.last()
        self.assertEqual(audit.action, AuditLog.ActionType.SALE_CREATE)
        self.assertEqual(audit.shop, self.shop)

    def test_credit_sale_increases_customer_balance(self):
        self.customer = Customer.objects.create(
            shop=self.shop, name="Test Customer", credit_limit=200
        )
        sale = _create_sale_from_data(
            shop=self.shop,
            user=self.owner,
            customer_id=str(self.customer.id),
            total_amount=50,
            discount=0,
            payment_method='CREDIT',
            items=[{'product': str(self.product.id), 'quantity': 5, 'unit_price': 10}],
            ip_address='127.0.0.1',
        )
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.total_credit, 50)