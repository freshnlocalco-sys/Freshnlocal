import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function updateFaviconInDOM(url: string | null) {
  if (typeof document === 'undefined') return;
  const links = document.querySelectorAll("link[rel*='icon']");
  
  if (url) {
    if (links.length > 0) {
      links.forEach((link) => {
        (link as HTMLLinkElement).href = url;
      });
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = url;
      document.head.appendChild(link);
    }
  } else {
    if (links.length > 0) {
      links.forEach((link) => {
        (link as HTMLLinkElement).href = '/favicon.ico';
      });
    } else {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = '/favicon.ico';
      document.head.appendChild(link);
    }
  }
}
