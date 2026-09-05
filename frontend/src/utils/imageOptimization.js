// Image optimization utilities for better performance
import React, { useState, useCallback } from 'react';

// Image compression utility
export const compressImage = (file, quality = 0.8, maxWidth = 800, maxHeight = 600) => {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      // Calculate new dimensions
      let { width, height } = img;
      
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;

      // Draw and compress
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        'image/jpeg',
        quality
      );
    };

    img.src = URL.createObjectURL(file);
  });
};

// Lazy loading hook for images
export const useLazyImage = (src, placeholder = null) => {
  const [imageSrc, setImageSrc] = useState(placeholder);
  const [imageRef, setImageRef] = useState(null);

  const onLoad = useCallback(() => {
    setImageSrc(src);
  }, [src]);

  const onError = useCallback(() => {
    setImageSrc(placeholder || '/placeholder-image.png');
  }, [placeholder]);

  const ref = useCallback((node) => {
    setImageRef(node);
    if (node) {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            const img = new Image();
            img.onload = onLoad;
            img.onerror = onError;
            img.src = src;
            observer.disconnect();
          }
        },
        { threshold: 0.1 }
      );
      observer.observe(node);
    }
  }, [src, onLoad, onError]);

  return [imageSrc, ref];
};

// WebP support detection
export const supportsWebP = () => {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.toDataURL('image/webp').indexOf('data:image/webp') === 0;
};

// Get optimized image URL
export const getOptimizedImageUrl = (originalUrl, options = {}) => {
  if (!originalUrl) return originalUrl;

  const {
    width,
    height,
    quality = 80,
    format = 'auto'
  } = options;

  // If it's already an optimized URL, return as is
  if (originalUrl.includes('_optimized') || originalUrl.includes('?')) {
    return originalUrl;
  }

  // For local images, we can add optimization parameters
  if (originalUrl.startsWith('/') || originalUrl.startsWith('./')) {
    const params = new URLSearchParams();
    if (width) params.append('w', width);
    if (height) params.append('h', height);
    if (quality) params.append('q', quality);
    if (format !== 'auto') params.append('f', format);
    
    const paramString = params.toString();
    return paramString ? `${originalUrl}?${paramString}` : originalUrl;
  }

  return originalUrl;
};

// Image preloader
export const preloadImages = (urls) => {
  return Promise.all(
    urls.map(url => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(url);
        img.onerror = () => reject(new Error(`Failed to load ${url}`));
        img.src = url;
      });
    })
  );
};

// Responsive image hook
export const useResponsiveImage = (src, sizes = [320, 640, 1024, 1920]) => {
  const [currentSrc, setCurrentSrc] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadImage = useCallback(async (imageSrc) => {
    setIsLoading(true);
    setError(null);

    try {
      const img = new Image();
      img.onload = () => {
        setCurrentSrc(imageSrc);
        setIsLoading(false);
      };
      img.onerror = () => {
        setError(new Error('Failed to load image'));
        setIsLoading(false);
      };
      img.src = imageSrc;
    } catch (err) {
      setError(err);
      setIsLoading(false);
    }
  }, []);

  const selectOptimalSize = useCallback((containerWidth) => {
    const optimalSize = sizes.find(size => size >= containerWidth) || sizes[sizes.length - 1];
    return getOptimizedImageUrl(src, { width: optimalSize });
  }, [src, sizes]);

  return {
    currentSrc,
    isLoading,
    error,
    loadImage,
    selectOptimalSize
  };
};

// Image format conversion
export const convertToWebP = (file) => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert to WebP'));
          }
        },
        'image/webp',
        0.8
      );
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
};

// Avatar optimization
export const optimizeAvatar = (file, size = 150) => {
  return compressImage(file, 0.9, size, size);
};

// Background image optimization
export const optimizeBackgroundImage = (file) => {
  return compressImage(file, 0.7, 1920, 1080);
};

// Thumbnail generation
export const generateThumbnail = (file, size = 200) => {
  return compressImage(file, 0.8, size, size);
};

export default {
  compressImage,
  useLazyImage,
  supportsWebP,
  getOptimizedImageUrl,
  preloadImages,
  useResponsiveImage,
  convertToWebP,
  optimizeAvatar,
  optimizeBackgroundImage,
  generateThumbnail
};
