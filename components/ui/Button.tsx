import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = "primary",
  size = "md",
  isLoading = false,
  leftIcon,
  rightIcon,
  className = "",
  disabled,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#090d16] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none active:scale-[0.98]";

  let variantStyles = "";
  switch (variant) {
    case "primary":
      variantStyles =
        "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg shadow-orange-500/25 focus:ring-orange-500 border border-orange-400/30";
      break;
    case "secondary":
      variantStyles =
        "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white shadow-lg shadow-purple-500/20 focus:ring-purple-500 border border-purple-400/30";
      break;
    case "danger":
      variantStyles =
        "bg-red-600/90 hover:bg-red-600 text-white shadow-lg shadow-red-600/20 focus:ring-red-500 border border-red-500/30";
      break;
    case "outline":
      variantStyles =
        "bg-charcoal-800/80 hover:bg-charcoal-750 text-slate-200 border border-charcoal-700 hover:border-slate-500 focus:ring-slate-400";
      break;
    case "ghost":
      variantStyles =
        "bg-transparent hover:bg-charcoal-800 text-slate-300 hover:text-white focus:ring-slate-500";
      break;
  }

  let sizeStyles = "";
  switch (size) {
    case "sm":
      sizeStyles = "px-3 py-1.5 text-xs gap-1.5";
      break;
    case "md":
      sizeStyles = "px-4 py-2 text-sm gap-2";
      break;
    case "lg":
      sizeStyles = "px-5 py-2.5 text-base gap-2.5";
      break;
  }

  return (
    <button
      className={`${baseStyles} ${variantStyles} ${sizeStyles} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-current" />
      ) : (
        leftIcon && <span className="shrink-0">{leftIcon}</span>
      )}
      <span>{children}</span>
      {!isLoading && rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
};
