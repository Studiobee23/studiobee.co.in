"use client";

import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { getInitials, getAvatarColorClass } from "@/lib/clients/avatar-style";
import { validateAvatarFile } from "@/lib/clients/avatar-validation";

const SIZE_CONFIG = {
  sm: { box: "h-8 w-8", text: "text-[10px]", icon: "h-3 w-3" },
  md: { box: "h-12 w-12", text: "text-sm", icon: "h-4 w-4" },
  lg: { box: "h-16 w-16", text: "text-base", icon: "h-5 w-5" },
} as const;

export function ClientAvatar({
  name,
  avatarUrl,
  size = "sm",
  editable = false,
  uploading = false,
  onFileSelected,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  editable?: boolean;
  uploading?: boolean;
  onFileSelected?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { box, text, icon } = SIZE_CONFIG[size];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validationError = validateAvatarFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    onFileSelected?.(file);
  }

  const avatarNode = (
    <Avatar className={box}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className={cn(box, text, "text-white", getAvatarColorClass(name))}>
        {getInitials(name)}
      </AvatarFallback>
    </Avatar>
  );

  if (!editable) return avatarNode;

  return (
    <div className="inline-flex flex-col items-center">
      <button
        type="button"
        aria-label={`Change photo for ${name}`}
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="group relative rounded-full disabled:cursor-not-allowed"
      >
        {avatarNode}
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100",
            uploading && "opacity-100"
          )}
        >
          {uploading ? (
            <Loader2 className={cn(icon, "animate-spin text-white")} />
          ) : (
            <Camera className={cn(icon, "text-white")} />
          )}
        </span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleChange}
      />
      {error && (
        <p className="mt-1 max-w-[6rem] text-center text-[10px] text-destructive">{error}</p>
      )}
    </div>
  );
}
