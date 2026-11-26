import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  glow?: "none" | "orange" | "purple";
}

export const Card: React.FC<CardProps> = ({
  children,
  className = "",
  glow = "none",
  ...props
}) => {
  let glowClasses = "";
  if (glow === "orange") {
    glowClasses = "border-orange-500/30 shadow-lg shadow-orange-500/10";
  } else if (glow === "purple") {
    glowClasses = "border-purple-500/30 shadow-lg shadow-purple-500/10";
  }

  return (
    <div
      className={`rounded-xl border border-[#222f49] bg-[#131b2e]/90 backdrop-blur-md text-slate-100 shadow-xl transition-all duration-200 ${glowClasses} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <div className={`p-5 pb-3 border-b border-[#222f49]/80 flex flex-col gap-1 ${className}`} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <h3 className={`text-base font-semibold text-white tracking-tight flex items-center gap-2 ${className}`} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <p className={`text-xs text-slate-400 font-normal leading-relaxed ${className}`} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <div className={`p-5 ${className}`} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = "",
  ...props
}) => (
  <div className={`p-5 pt-3 border-t border-[#222f49]/80 flex items-center justify-between gap-3 ${className}`} {...props}>
    {children}
  </div>
);
