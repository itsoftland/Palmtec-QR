from django.contrib.auth.models import UserManager


class CustomUserManager(UserManager):
    def create_user(self, username, email=None, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required for all users.')
        extra_fields.setdefault('role', 'company_user')
        extra_fields.setdefault('tier', 'none')
        email = self.normalize_email(email)
        return super().create_user(
            username=username,
            email=email,
            password=password,
            **extra_fields,
        )

    def create_superuser(self, username, email=None, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required.')
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_verified', True)
        extra_fields.setdefault('role', 'superadmin')
        extra_fields.setdefault('tier', 'none')
        email = self.normalize_email(email)
        return super().create_superuser(
            username=username,
            email=email,
            password=password,
            **extra_fields,
        )
