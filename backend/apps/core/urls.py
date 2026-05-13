from django.urls import path
from .views import BackupDownloadView, BackupRestoreView

urlpatterns = [
    path('backup/download/', BackupDownloadView.as_view(), name='backup-download'),
    path('backup/restore/', BackupRestoreView.as_view(), name='backup-restore'),
]