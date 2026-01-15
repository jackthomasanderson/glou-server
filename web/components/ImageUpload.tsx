"use client";

import { useRef, useState } from "react";
import { useTranslations } from "@/lib/i18n/I18nProvider";

interface ImageUploadProps {
    value: string | null;
    onChange: (value: string | null) => void;
    label?: string;
    shape?: "circle" | "square";
    defaultImage?: string;
}

export default function ImageUpload({ value, onChange, label, shape = "square", defaultImage }: ImageUploadProps) {
    const { t } = useTranslations();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const compressImage = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Create canvas for compression
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                        reject(new Error('Could not get canvas context'));
                        return;
                    }

                    // Calculate new dimensions (max 800px on longest side)
                    const maxSize = 800;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > maxSize) {
                            height = (height * maxSize) / width;
                            width = maxSize;
                        }
                    } else {
                        if (height > maxSize) {
                            width = (width * maxSize) / height;
                            height = maxSize;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;

                    // Draw and compress
                    ctx.drawImage(img, 0, 0, width, height);
                    const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                    resolve(compressedBase64);
                };
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target?.result as string;
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const compressedBase64 = await compressImage(file);
                onChange(compressedBase64);
            } catch (error) {
                console.error('Image compression failed:', error);
                // Fallback to original if compression fails
                const reader = new FileReader();
                reader.onloadend = () => {
                    onChange(reader.result as string);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const handleRemove = () => {
        onChange(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const displayImage = value || defaultImage;

    return (
        <div className="image-upload">
            {label && <span className="image-upload__label">{label}</span>}
            <div className={`image-upload__container image-upload__container--${shape}`}>
                {displayImage ? (
                    <img src={displayImage} alt="Preview" className="image-upload__preview" />
                ) : (
                    <div className="image-upload__placeholder">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="M21 15l-5-5L5 21" />
                        </svg>
                    </div>
                )}
                <div className="image-upload__overlay">
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="image-upload__btn">
                        {displayImage ? t("actions.edit") : t("actions.add")}
                    </button>
                    {displayImage && (
                        <button type="button" onClick={handleRemove} className="image-upload__btn image-upload__btn--danger">
                            {t("actions.delete")}
                        </button>
                    )}
                </div>
            </div>
            <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/*"
                style={{ display: "none" }}
            />
        </div>
    );
}
