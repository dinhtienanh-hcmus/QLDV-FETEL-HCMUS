/**
 * Utility to compress avatar images before uploading to Firestore.
 * Reduces raw multi-megabyte photos down to a clean, crisp 256x256 thumbnail (~15-25KB)
 * to avoid exceeding Firestore's 1MB document limit.
 */
export async function compressImage(
  fileOrDataUrl: File | Blob | string,
  maxWidth = 256,
  maxHeight = 256,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const processImage = (imgSrc: string) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(imgSrc);
          return;
        }

        // Fill white background for transparent PNGs converted to JPEG
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);

        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedDataUrl);
      };

      img.onerror = () => {
        // Fallback to original source if image load fails
        resolve(typeof fileOrDataUrl === 'string' ? fileOrDataUrl : '');
      };

      img.src = imgSrc;
    };

    if (typeof fileOrDataUrl === 'string') {
      processImage(fileOrDataUrl);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          processImage(result);
        } else {
          reject(new Error('Không thể đọc file ảnh'));
        }
      };
      reader.onerror = () => reject(new Error('Lỗi khi đọc file ảnh'));
      reader.readAsDataURL(fileOrDataUrl);
    }
  });
}
