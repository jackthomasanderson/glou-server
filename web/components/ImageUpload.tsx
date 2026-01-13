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
    const [preview, setPreview] = useState<string | null>(value);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                setPreview(base64String);
                onChange(base64String);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemove = () => {
        setPreview(null);
        onChange(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const displayImage = preview || value || defaultImage;

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
