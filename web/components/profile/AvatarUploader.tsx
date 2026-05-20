'use client';
import React, { useRef, useState } from 'react';
import { Box, Avatar, Typography, IconButton, CircularProgress, Alert, Snackbar, TextField } from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import CheckIcon from '@mui/icons-material/Check';
import CloseIcon from '@mui/icons-material/Close';
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
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);
    const [editingUsername, setEditingUsername] = useState(false);
    const [usernameValue, setUsernameValue] = useState(user.username);

    const handleUsernameConfirm = () => {
        const trimmed = usernameValue.trim();
        if (!trimmed || trimmed === user.username) { setEditingUsername(false); return; }
        updateProfile.mutate({ username: trimmed }, {
            onSuccess: () => { setEditingUsername(false); setFeedback({ type: 'success', msg: t('profile.saveSuccess') }); },
            onError: (err) => { setFeedback({ type: 'error', msg: err.message === 'USERNAME_ALREADY_TAKEN' ? t('auth.errors.USERNAME_ALREADY_TAKEN') : t('profile.avatarError') }); },
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleUpload(e.target.files[0]);
        }
    };

    const handleUpload = (file: File) => {
        uploadAvatar.mutate(file, {
            onSuccess: () => {
                setFeedback({ type: 'success', msg: t('profile.avatarSuccess') });
            },
            onError: (err) => {
                setFeedback({ type: 'error', msg: t('profile.avatarError') });
                console.error('Avatar upload error:', err);
            }
        });
    };

    const handleDelete = () => {
        deleteAvatar.mutate(undefined, {
            onSuccess: () => {
                setFeedback({ type: 'success', msg: t('profile.deleteAvatarSuccess') });
            },
            onError: (err) => {
                setFeedback({ type: 'error', msg: t('profile.deleteAvatarError') });
                console.error('Avatar delete error:', err);
            }
        });
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleUpload(e.dataTransfer.files[0]);
        }
    };

    return (
        <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            mb={4}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            sx={{
                p: 2,
                borderRadius: 2,
                border: isDragging ? '2px dashed primary.main' : '2px dashed transparent',
                transition: 'all 0.2s',
            }}
        >
            <Box
                position="relative"
                onMouseEnter={() => setIsHovered(true)}
                onMouseLeave={() => setIsHovered(false)}
                sx={{ cursor: 'pointer' }}
                onClick={() => fileInputRef.current?.click()}
            >
                <Avatar
                    src={user?.avatarUrl || undefined}
                    sx={{
                        width: 100,
                        height: 100,
                        bgcolor: 'primary.main',
                        fontSize: '2.5rem',
                        opacity: isHovered || uploadAvatar.isPending ? 0.7 : 1,
                        transition: 'opacity 0.2s'
                    }}
                >
                    {!user?.avatarUrl && user?.username?.charAt(0).toUpperCase()}
                </Avatar>

                {uploadAvatar.isPending && (
                    <CircularProgress
                        size={40}
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            marginTop: '-20px',
                            marginLeft: '-20px'
                        }}
                    />
                )}

                {isHovered && !uploadAvatar.isPending && (
                    <IconButton
                        sx={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            transform: 'translate(-50%, -50%)',
                            color: 'white',
                            bgcolor: 'rgba(0,0,0,0.5)',
                            '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }
                        }}
                    >
                        <PhotoCameraIcon />
                    </IconButton>
                )}

                {user?.avatarUrl && !uploadAvatar.isPending && (
                    <IconButton
                        size="small"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDelete();
                        }}
                        sx={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            color: 'error.main',
                            bgcolor: 'background.paper',
                            boxShadow: 2,
                            '&:hover': { bgcolor: 'background.default' }
                        }}
                        title={t('profile.deleteAvatar')}
                    >
                        <DeleteIcon fontSize="small" />
                    </IconButton>
                )}
            </Box>

            {editingUsername ? (
                <Box display="flex" alignItems="center" gap={0.5} mt={2}>
                    <TextField
                        size="small"
                        value={usernameValue}
                        onChange={(e) => setUsernameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleUsernameConfirm(); if (e.key === 'Escape') { setEditingUsername(false); setUsernameValue(user.username); } }}
                        autoFocus
                        sx={{ width: 160 }}
                        disabled={updateProfile.isPending}
                    />
                    <IconButton size="small" onClick={handleUsernameConfirm} disabled={updateProfile.isPending} color="primary">
                        {updateProfile.isPending ? <CircularProgress size={16} /> : <CheckIcon fontSize="small" />}
                    </IconButton>
                    <IconButton size="small" onClick={() => { setEditingUsername(false); setUsernameValue(user.username); }}>
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>
            ) : (
                <Box display="flex" alignItems="center" gap={0.5} mt={2}>
                    <Typography variant="subtitle1" fontWeight={700}>
                        {user.username}
                    </Typography>
                    <IconButton size="small" onClick={() => { setUsernameValue(user.username); setEditingUsername(true); }} sx={{ opacity: 0.5, '&:hover': { opacity: 1 } }}>
                        <EditIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                </Box>
            )}
            <Typography variant="body2" color="text.secondary">
                {user?.email}
            </Typography>
            <Typography variant="caption" color="text.secondary" mt={1} textAlign="center">
                Cliquez ou glissez une image<br />
                (Recommandé: 400x400px, max 5MB)
            </Typography>

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                style={{ display: 'none' }}
                accept="image/*"
            />

            <Snackbar
                open={!!feedback}
                autoHideDuration={4000}
                onClose={() => setFeedback(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                {feedback ? (
                    <Alert onClose={() => setFeedback(null)} severity={feedback.type} sx={{ width: '100%' }}>
                        {feedback.msg}
                    </Alert>
                ) : undefined}
            </Snackbar>
        </Box>
    );
}
