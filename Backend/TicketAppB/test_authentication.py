from unittest.mock import patch
from uuid import uuid4

from django.core.cache import cache
from django.test import RequestFactory, SimpleTestCase, override_settings

from .authentication import COOKIE_NAME, SessionAuthentication, _cache_key
from .models import UserSession


@override_settings(CACHES={
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        'LOCATION': 'inactive-session-auth-tests',
    },
})
class InactiveCachedSessionAuthenticationTests(SimpleTestCase):
    def test_inactive_session_with_stale_cache_is_rejected(self):
        session_uid = str(uuid4())
        cache.clear()
        cache.set(_cache_key(session_uid), '42:android', timeout=300)
        request = RequestFactory().get(
            '/protected/',
            HTTP_COOKIE=f'{COOKIE_NAME}={session_uid}',
        )

        with patch.object(UserSession.objects, 'select_related') as select_related:
            select_related.return_value.get.side_effect = UserSession.DoesNotExist
            result = SessionAuthentication().authenticate(request)

        self.assertIsNone(result)
        self.assertIsNone(cache.get(_cache_key(session_uid)))