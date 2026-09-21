// 统一的线性小图标（1.8 描边，随文字颜色），替代表情符号
import type { ReactNode } from "react";

type IconProps = { size?: number; className?: string };

function base(path: ReactNode, { size = 16, className = "icon" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {path}
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return base(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, props);
}

export function ThumbUpIcon(props: IconProps) {
  return base(<path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3zm0 0 4-7a2.4 2.4 0 0 1 2.4 2.4V10h5.2a2 2 0 0 1 2 2.4l-1.2 6a2 2 0 0 1-2 1.6H7" />, props);
}

export function ThumbDownIcon(props: IconProps) {
  return base(<path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3zm0 0-4 7a2.4 2.4 0 0 1-2.4-2.4V14H5.4a2 2 0 0 1-2-2.4l1.2-6a2 2 0 0 1 2-1.6H17" />, props);
}

export function UploadIcon(props: IconProps) {
  return base(<path d="M12 16V4m0 0 4.5 4.5M12 4 7.5 8.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />, props);
}

export function DownloadIcon(props: IconProps) {
  return base(<path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />, props);
}

export function ExternalIcon(props: IconProps) {
  return base(<path d="M9 15 20 4m0 0h-7m7 0v7" />, props);
}
