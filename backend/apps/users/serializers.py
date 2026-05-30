from rest_framework import serializers
from .models import User, Shop
from django.contrib.auth.hashers import make_password

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('id', 'phone', 'email', 'role', 'is_active', 'shop', 'is_superuser')
        read_only_fields = ('shop',)

class ShopSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shop
        fields = ('id', 'name', 'address')

class RegisterSerializer(serializers.Serializer):
    shop_name = serializers.CharField(max_length=255)
    phone = serializers.CharField(max_length=15)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True)
    address = serializers.CharField(required=False, allow_blank=True)

    def validate_phone(self, value):
        if User.objects.filter(phone=value).exists():
            raise serializers.ValidationError("A user with this phone number already exists.")
        return value

    def validate_email(self, value):
        if value and '@' not in value:
            raise serializers.ValidationError("Enter a valid email address.")
        return value