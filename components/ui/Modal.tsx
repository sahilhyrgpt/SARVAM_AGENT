"use client";

import React, { useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl";
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = "xl",
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.body.style.overflow = "unset";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  let widthClass = "max-w-xl";
  switch (maxWidth) {
    case "sm":
      widthClass = "max-w-sm";
      break;
    case "md":
      widthClass = "max-w-md";
      break;
    case "lg":
      widthClass = "max-w-lg";
      break;
    case "xl":
      widthClass = "max-w-xl";
      break;
    case "2xl":
      widthClass = "max-w-2xl";
      break;
    case "3xl":
      widthClass = "max-w-3xl";
      break;
    case "4xl":
      widthClass = "max-w-4xl";
      break;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity duration-200"
        onClick={onClose}
      />

      {/* Dialog Body */}
      <div
        className={`relative z-10 w-full ${widthClass} rounded-2xl border border-[#222f49] bg-[#111827] p-6 text-left shadow-2xl shadow-black/80 transition-all duration-200 max-h-[90vh] flex flex-col`}
      >
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-[#222f49]">
          <div className="space-y-1 pr-6">
            {title && <h3 className="text-lg font-bold text-white tracking-tight">{title}</h3>}
            {description && <p className="text-xs text-slate-400">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1f293d] hover:text-white transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-1">{children}</div>
      </div>
    </div>
  );
};
