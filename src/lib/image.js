// Printify mockup exports can run several MB straight off a phone or a
// high-res screenshot — base64 inflates that further, and Claude's vision
// input doesn't benefit past ~1568px on the long edge anyway (it downscales
// server-side regardless). Resize + re-encode as JPEG client-side so a real
// mockup upload doesn't risk tripping the request-size limit.
export function resizeImageForUpload(file, maxDimension = 1568, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Could not read image file')); };
    img.src = objectUrl;
  });
}
