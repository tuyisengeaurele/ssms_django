from django.urls import path
from .views import RegisterView, LoginView, ProfileView
from .password_reset_views import PasswordResetRequestView, PasswordResetConfirmView

urlpatterns = [
    path('register', RegisterView.as_view(), name='auth_register'),
    path('login', LoginView.as_view(), name='auth_login'),
    path('me', ProfileView.as_view(), name='auth_me'),
    path('password-reset/request', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
]
