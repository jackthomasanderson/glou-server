import React from "react";

// Generic, clean loader used across the app (replaces the bottle-specific animation)
const LoadingWine: React.FC<{ message?: string }> = ({ message }) => {
  return (
    <div className="generic-loader" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true"></div>
      <div className="loader-lines" aria-hidden="true">
        <div className="line short" />
        <div className="line" />
        <div className="line long" />
      </div>
      <div className="loader-message">{message ?? "Chargement…"}</div>
    </div>
  );
};

export default LoadingWine;
