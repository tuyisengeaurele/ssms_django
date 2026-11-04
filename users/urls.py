from django.urls import path

from .email_verification_views import ResendVerificationView, VerifyEmailView
from .password_reset_views import PasswordResetConfirmView, PasswordResetRequestView
from .session_views import SessionDetailView, SessionListView, SessionPingView, SessionRevokeOthersView
from .views import ChangePasswordView, CookieTokenRefreshView, LoginView, LogoutView, ProfileView, RegisterView

urlpatterns = [
    path('register',          RegisterView.as_view(),         name='auth_register'),
    path('login',             LoginView.as_view(),            name='auth_login'),
    path('logout',            LogoutView.as_view(),           name='auth_logout'),
    path('me',                ProfileView.as_view(),          name='auth_me'),
    path('change-password',   ChangePasswordView.as_view(),   name='auth_change_password'),
    path('session/ping',            SessionPingView.as_view(),         name='auth_session_ping'),
    path('sessions',                SessionListView.as_view(),         name='auth_sessions'),
    path('sessions/revoke-others',  SessionRevokeOthersView.as_view(), name='auth_sessions_revoke_others'),
    path('sessions/<str:pk>',       SessionDetailView.as_view(),       name='auth_session'),
    path('token/refresh',     CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('password-reset/request', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('verify-email',           VerifyEmailView.as_view(),           name='verify_email'),
    path('resend-verification',    ResendVerificationView.as_view(),    name='resend_verification'),
]
