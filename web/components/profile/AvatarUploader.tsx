'use client';
import React, { useRef, useState } from 'react';
import { Box, Avatar, Typography, IconButton, CircularProgress } from '@mui/material';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import { useUploadAvatar } from '@/hooks/useAuth';

export function AvatarUploader({ user }: { user: any }) {
    const uploadAvatar = useUploadAvatar();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            handleUpload(e.target.files[0]);
        }
    };

    const handleUpload = (file: File) => {
        uploadAvatar.mutate(file);
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
            </Box>

            <Typography variant="subtitle1" fontWeight={700} mt={2}>
                @{user?.username}
            </Typography>
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
        </Box>
    );
}
