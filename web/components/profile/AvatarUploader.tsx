'use client';
import React, { useRef, useState } from 'react';
import { Avatar, Button, Input, CircularProgress } from '@heroui/react';
import { Camera, Trash2, Pencil, Check, X } from 'lucide-react';
import { useUploadAvatar, useDeleteAvatar, useUpdateProfile, PublicUser } from '@/hooks/useAuth';
import { useTranslation } from 'react-i18next';

export function AvatarUploader({ user }: { user: PublicUser }) {
  const { t } = useTranslation();
  const uploadAvatar = useUploadAvatar();
  const deleteAvatar = useDeleteAvatar();
  const updateProfile = useUpdateProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [editingUsername, setEditingUsername] = useState(false);
  const [usernameValue, setUsernameValue] = useState(user.username);

  const handleUsernameConfirm = () => {
    const trimmed = usernameValue.trim();
    if (!trimmed || trimmed === user.username) { setEditingUsername(false); return; }
    updateProfile.mutate({ username: trimmed }, {
      onSuccess: () => { setEditingUsername(false); setFeedback({ type: 'success', msg: t('profile.saveSuccess') }); },
      onError: (err) => {
        setFeedback({ type: 'error', msg: err.message === 'USERNAME_ALREADY_TAKEN' ? t('auth.errors.USERNAME_ALREADY_TAKEN') : t('profile.avatarError') });
      },
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) handleUpload(e.target.files[0]);
  };

  const handleUpload = (file: File) => {
    uploadAvatar.mutate(file, {
      onSuccess: () => setFeedback({ type: 'success', msg: t('profile.avatarSuccess') }),
      onError: () => setFeedback({ type: 'error', msg: t('profile.avatarError') }),
    });
  };

  const handleDelete = () => {
    deleteAvatar.mutate(undefined, {
      onSuccess: () => setFeedback({ type: 'success', msg: t('profile.deleteAvatarSuccess') }),
      onError: () => setFeedback({ type: 'error', msg: t('profile.deleteAvatarError') }),
    });
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files[0]);
  };

  return (
    <div
      className={`flex flex-col items-center mb-8 p-4 rounded-xl transition-all duration-200 border-2 ${isDragging ? 'border-primary border-dashed' : 'border-transparent'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className="relative cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onClick={() => fileInputRef.current?.click()}
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
          <div className="absolute inset-0 flex items-center justify-center">
            <CircularProgress size="sm" color="primary" isIndeterminate />
          </div>
        )}

        {isHovered && !uploadAvatar.isPending && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50">
            <Camera size={20} className="text-white" />
          </div>
        )}

        {user?.avatarUrl && !uploadAvatar.isPending && (
          <button
            className="absolute top-0 right-0 w-6 h-6 bg-content1 rounded-full shadow flex items-center justify-center text-danger hover:bg-default-100"
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            title={t('profile.deleteAvatar')}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      {editingUsername ? (
        <div className="flex items-center gap-1 mt-3">
          <Input
            size="sm"
            value={usernameValue}
            onValueChange={setUsernameValue}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleUsernameConfirm();
              if (e.key === 'Escape') { setEditingUsername(false); setUsernameValue(user.username); }
            }}
            autoFocus
            className="w-40"
            isDisabled={updateProfile.isPending}
          />
          <Button isIconOnly size="sm" variant="light" color="primary" onPress={handleUsernameConfirm} isDisabled={updateProfile.isPending} aria-label={t('actions.confirm')}>
            {updateProfile.isPending ? <CircularProgress size="sm" isIndeterminate /> : <Check size={14} />}
          </Button>
          <Button isIconOnly size="sm" variant="light" onPress={() => { setEditingUsername(false); setUsernameValue(user.username); }} aria-label={t('actions.cancel')}>
            <X size={14} />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1 mt-3">
          <span className="text-sm font-bold">{user.username}</span>
          <Button
            isIconOnly size="sm" variant="light" color="default"
            onPress={() => { setUsernameValue(user.username); setEditingUsername(true); }}
            className="opacity-50 hover:opacity-100"
            aria-label={t('actions.edit')}
          >
            <Pencil size={13} />
          </Button>
        </div>
      )}

      <p className="text-sm text-foreground-500">{user?.email}</p>
      <p className="text-xs text-foreground-400 mt-2 text-center" style={{ whiteSpace: 'pre-line' }}>
        {t('profile.avatarHint')}
      </p>

      {feedback && (
        <div className={`mt-3 text-sm px-4 py-2 rounded-lg ${feedback.type === 'success' ? 'bg-success-50 text-success border border-success-200' : 'bg-danger-50 text-danger border border-danger-200'}`}>
          {feedback.msg}
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        accept="image/*"
      />
    </div>
  );
}
