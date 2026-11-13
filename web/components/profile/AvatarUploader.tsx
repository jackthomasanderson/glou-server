'use client';
import React, { useRef, useState } from 'react';
import {
  Avatar, Button, CircularProgress,
  ModalContent, ModalHeader, ModalBody, ModalFooter,
} from '@heroui/react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Camera, Trash2 } from 'lucide-react';
import { useUploadAvatar, useDeleteAvatar, PublicUser } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';
import { downscaleImage } from '@/lib/image-resize';

export function AvatarUploader({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) void handleUpload(e.target.files[0]);
  };

  const handleUpload = async (original: File) => {
    // #494: an avatar is shown at 96 px at most.
    const file = await downscaleImage(original, 512);
    uploadAvatar.mutate(file, {
      onSuccess: () => setFeedback({ type: 'success', msg: t('profile.avatarSuccess') }),
      onError: () => setFeedback({ type: 'error', msg: t('profile.avatarError') }),
    });
  };

  const handleDelete = () => {
    deleteAvatar.mutate(undefined, {
      onSuccess: () => setFeedback({ type: 'success', msg: t('profile.deleteAvatarSuccess') }),
      onError: () => setFeedback({ type: 'error', msg: t('profile.deleteAvatarError') }),
      onSettled: () => setConfirmingDelete(false),
    });
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) void handleUpload(e.dataTransfer.files[0]);
  };

  return (
    <div
      className={`flex flex-col items-center p-2 rounded-xl transition-all duration-200 border-2 ${isDragging ? 'border-primary border-dashed' : 'border-transparent'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="relative">
        <button
          type="button"
          className="relative rounded-full cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={() => fileInputRef.current?.click()}
          aria-label={t('profile.changeAvatar')}
        >
          <Avatar
            src={user?.avatarUrl || undefined}
            name={(!user?.avatarUrl && user?.username?.charAt(0).toUpperCase()) || undefined}
            size="lg"
            radius="full"
            isBordered
            color="primary"
            className={`w-24 h-24 text-4xl transition-opacity duration-200 ${isHovered || uploadAvatar.isPending ? 'opacity-70' : 'opacity-100'}`}
          />

          {uploadAvatar.isPending && (
            <div className="absolute inset-0 flex items-center justify-center" role="status" aria-live="polite">
              <CircularProgress size="sm" color="primary" isIndeterminate aria-label={t('status.loading')} />
            </div>
          )}

          {!uploadAvatar.isPending && (
            <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera size={20} className="text-white" />
            </div>
          )}

          {/* Always-visible cue (touch screens have no hover) */}
          {!uploadAvatar.isPending && (
            <span aria-hidden="true" className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-primary text-primary-foreground shadow flex items-center justify-center">
              <Camera size={12} />
            </span>
          )}
        </button>

        {user?.avatarUrl && !uploadAvatar.isPending && (
          <button
            type="button"
            className="absolute top-0 right-0 w-6 h-6 bg-content1 rounded-full shadow flex items-center justify-center text-danger hover:bg-default-100"
            onClick={() => setConfirmingDelete(true)}
            title={t('profile.deleteAvatar')}
            aria-label={t('profile.deleteAvatar')}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {/* #769: the username is a sign-in identifier, changed from the security card with the password. */}
      <p className="text-sm font-bold mt-3">{user.username}</p>
      <p className="text-sm text-foreground-500">{user?.email}</p>
      <p className="text-xs text-foreground-400 mt-2 text-center" style={{ whiteSpace: 'pre-line' }}>
        {t('profile.avatarHint')}
      </p>

      {feedback && (
        <div role={feedback.type === 'success' ? 'status' : 'alert'} className={`mt-3 text-sm px-4 py-2 rounded-lg ${feedback.type === 'success' ? 'bg-success-50 text-success-700 border border-success-200' : 'bg-danger-50 text-danger border border-danger-200'}`}>
          {feedback.msg}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        accept="image/jpeg,image/png,image/webp,image/gif"
      />

      <ResponsiveModal
        isOpen={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        size="sm"
        radius="lg"
        backdrop="opaque"
        placement="center"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>{t('profile.deleteAvatar')}</ModalHeader>
              <ModalBody>
                <p className="text-sm text-foreground-600">{t('profile.deleteAvatarConfirm')}</p>
              </ModalBody>
              <ModalFooter>
                <Button color="default" variant="light" onPress={() => setConfirmingDelete(false)}>
                  {t('actions.cancel')}
                </Button>
                <Button
                  color="danger"
                  variant="solid"
                  onPress={handleDelete}
                  isLoading={deleteAvatar.isPending}
                  isDisabled={deleteAvatar.isPending}
                >
                  {t('actions.delete')}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </ResponsiveModal>
    </div>
  );
}
