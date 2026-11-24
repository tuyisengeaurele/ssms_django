from django.urls import path

from .closure_views import CancelDeleteAccountView, DeleteAccountView
from .email_change_views import EmailChangeConfirmView, EmailChangeUndoView, EmailChangeView
from .email_verification_views import ResendVerificationView, VerifyEmailView
from .export_views import ExportView
from .mfa_views import (
    MfaRecoveryCodesView,
    MfaSetupConfirmView,
    MfaSetupStartView,
    MfaStatusView,
    MfaStepUpView,
    MfaVerifyView,
)
from .notification_views import NotificationPreferencesView
from .password_reset_views import PasswordResetConfirmView, PasswordResetRequestView
from .photo_views import PhotoView
from .session_views import SessionDetailView, SessionListView, SessionPingView, SessionRevokeOthersView
from .views import ChangePasswordView, CookieTokenRefreshView, LoginView, LogoutView, ProfileView, RegisterView

urlpatterns = [
    path('register',          RegisterView.as_view(),         name='auth_register'),
    path('login',             LoginView.as_view(),            name='auth_login'),
    path('logout',            LogoutView.as_view(),           name='auth_logout'),
    path('mfa',               MfaStatusView.as_view(),        name='auth_mfa_status'),
    path('mfa/recovery-codes', MfaRecoveryCodesView.as_view(), name='auth_mfa_recovery_codes'),
    path('mfa/verify',        MfaVerifyView.as_view(),        name='auth_mfa_verify'),
    path('mfa/step-up',       MfaStepUpView.as_view(),        name='auth_mfa_step_up'),
    path('mfa/setup/start',   MfaSetupStartView.as_view(),    name='auth_mfa_setup_start'),
    path('mfa/setup/confirm', MfaSetupConfirmView.as_view(),  name='auth_mfa_setup_confirm'),
    path('me',                ProfileView.as_view(),          name='auth_me'),
    path('me/photo',          PhotoView.as_view(),            name='auth_photo'),
    path('me/notifications',  NotificationPreferencesView.as_view(), name='auth_me_notifications'),
    path('change-password',   ChangePasswordView.as_view(),   name='auth_change_password'),
    path('email-change',            EmailChangeView.as_view(),        name='auth_email_change'),
    path('email-change/confirm',    EmailChangeConfirmView.as_view(),  name='auth_email_change_confirm'),   # public: the link in the email
    path('email-change/undo',       EmailChangeUndoView.as_view(),     name='auth_email_change_undo'),      # public: the undo link
    path('delete-account',          DeleteAccountView.as_view(),       name='auth_delete_account'),
    path('delete-account/cancel',   CancelDeleteAccountView.as_view(), name='auth_delete_account_cancel'),
    path('export',                  ExportView.as_view(),              name='auth_export'),
    path('session/ping',           SessionPingView.as_view(),         name='auth_session_ping'),
    path('sessions',                SessionListView.as_view(),         name='auth_sessions'),
    path('sessions/revoke-others',  SessionRevokeOthersView.as_view(), name='auth_sessions_revoke_others'),
    path('sessions/<str:pk>',       SessionDetailView.as_view(),       name='auth_session'),
    path('token/refresh',     CookieTokenRefreshView.as_view(), name='token_refresh'),
    path('password-reset/request', PasswordResetRequestView.as_view(), name='password_reset_request'),
    path('password-reset/confirm', PasswordResetConfirmView.as_view(), name='password_reset_confirm'),
    path('verify-email',           VerifyEmailView.as_view(),           name='verify_email'),
    path('resend-verification',    ResendVerificationView.as_view(),    name='resend_verification'),
]
