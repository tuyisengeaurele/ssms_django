from django.urls import path
from .views import RegisterView, LoginView, ProfileView, ChangePasswordView, LogoutView
from .password_reset_views import PasswordResetRequestView, PasswordResetConfirmView
from .email_verification_views import VerifyEmailView, ResendVerificationView

urlpatterns = [
    path('register',          RegisterView.as_view(),         name='auth_register'),
    path('login',             LoginView.as_view(),            name='auth_login'),
    path('logout',            LogoutView.as_view(),           name='auth_logout'),
    path('me',                ProfileView.as_view(),          name='auth_me'),
    path('change-password',   ChangePasswordView.as_view(),   name='auth_change_password'),
    path('password-reset/request', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('verify-email',           VerifyEmailView.as_view(),           name='verify_email'),
    path('resend-verification',    ResendVerificationView.as_view(),    name='resend_verification'),
]
