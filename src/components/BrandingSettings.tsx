import React, { useState, useEffect, useRef } from 'react';
import { useSettings } from '../store/useSettings';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from '../lib/firebase';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Trash2, Globe, Save, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react';

export function BrandingSettings() {
  const { faviconUrl, updateFavicon, fetchFavicon } = useSettings();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize or update preview when faviconUrl from store loads
  useEffect(() => {
    if (faviconUrl) {
      setPreviewUrl(faviconUrl);
    } else {
      setPreviewUrl('/favicon.ico');
    }
  }, [faviconUrl]);

  const convertToPng = (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error('Canvas conversion failed'));
              }
            }, 'image/png');
          } else {
            reject(new Error('Canvas context not available'));
          }
        };
        img.onerror = () => reject(new Error('Image load error'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('File reader error'));
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelection = async (file: File) => {
    // 1. Validation of size: Max 1 MB
    if (file.size > 1 * 1024 * 1024) {
      toast.error('File size exceeds the 1 MB limit. Please select a smaller icon.');
      return;
    }

    // 2. Format validation
    const allowedExtensions = ['.png', '.ico', '.svg', '.jpg', '.jpeg'];
    const fileNameLower = file.name.toLowerCase();
    const hasAllowedExtension = allowedExtensions.some(ext => fileNameLower.endsWith(ext));
    
    if (!hasAllowedExtension) {
      toast.error('Invalid file format. Only PNG, ICO, SVG, and JPG are supported.');
      return;
    }

    // 3. Generate Local Preview and Read Dimensions
    setSelectedFile(file);
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);

    // Read Dimensions
    try {
      const img = new Image();
      img.onload = () => {
        setDimensions({ width: img.width, height: img.height });
      };
      img.src = localUrl;
    } catch (err) {
      console.warn('Could not read image dimensions', err);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleSave = async () => {
    if (!selectedFile) {
      toast.error('No new file selected for saving.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      let finalFile: Blob | File = selectedFile;
      const isJpg = selectedFile.type === 'image/jpeg' || selectedFile.type === 'image/jpg' || selectedFile.name.toLowerCase().endsWith('.jpg') || selectedFile.name.toLowerCase().endsWith('.jpeg');
      
      if (isJpg) {
        toast.loading('Converting JPG to PNG format...', { id: 'converting' });
        try {
          finalFile = await convertToPng(selectedFile);
          toast.success('Successfully converted to PNG!', { id: 'converting' });
        } catch (convErr) {
          console.error('JPG conversion error', convErr);
          toast.error('Format conversion failed. Saving JPG directly instead.', { id: 'converting' });
        }
      }

      setUploadProgress(30);
      const extension = isJpg ? 'png' : selectedFile.name.split('.').pop() || 'png';
      const storagePath = `branding/favicon_${Date.now()}.${extension}`;
      const storageRef = ref(storage, storagePath);

      const uploadTask = uploadBytesResumable(storageRef, finalFile);

      await new Promise<void>((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 70;
            setUploadProgress(30 + progress);
          },
          (error) => reject(error),
          () => resolve()
        );
      });

      const downloadUrl = await getDownloadURL(storageRef);
      setUploadProgress(100);

      // Save to Firestore & State & DOM immediately
      await updateFavicon(downloadUrl);
      
      toast.success('Website Tab Icon updated successfully!');
      setSelectedFile(null);
      setDimensions(null);
    } catch (err: any) {
      console.error('Upload error', err);
      toast.error('Failed to upload favicon: ' + (err.message || err));
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleRestoreDefault = async () => {
    const confirmRestore = window.confirm('Are you sure you want to restore the default browser favicon?');
    if (!confirmRestore) return;

    try {
      toast.loading('Restoring default favicon...', { id: 'restore' });
      await updateFavicon(null);
      setSelectedFile(null);
      setDimensions(null);
      setPreviewUrl('/favicon.ico');
      toast.success('Default favicon restored successfully!', { id: 'restore' });
    } catch (err: any) {
      console.error('Restore error', err);
      toast.error('Failed to restore default favicon.', { id: 'restore' });
    }
  };

  const handleCancelSelection = () => {
    setSelectedFile(null);
    setDimensions(null);
    setPreviewUrl(faviconUrl || '/favicon.ico');
  };

  // Check if dimensions are exactly matching the recommended values
  const isRecommendedSize = dimensions 
    ? (dimensions.width === 32 && dimensions.height === 32) ||
      (dimensions.width === 48 && dimensions.height === 48) ||
      (dimensions.width === 64 && dimensions.height === 64)
    : false;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-b border-border pb-6">
        <div>
          <h2 className="text-xl sm:text-2xl font-black uppercase text-foreground flex items-center gap-2.5">
            <Globe className="w-6 h-6 text-primary shrink-0" /> Website Branding
          </h2>
          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1.5">
            Manage your website's custom browser aesthetics without touching the code
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Settings panel */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-border rounded-2xl p-6 shadow-xs space-y-6">
            <h3 className="text-xs font-black uppercase tracking-widest text-foreground">
              Tab Icon Configuration
            </h3>

            {/* Custom Dropzone / Upload Area */}
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer select-none flex flex-col items-center justify-center gap-3 ${
                isDragActive 
                  ? 'border-primary bg-primary/5 scale-[1.01]' 
                  : 'border-border hover:border-foreground/40 hover:bg-neutral-50/50'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept=".png,.ico,.svg,.jpg,.jpeg"
                className="hidden" 
              />
              <div className="p-4 rounded-full bg-secondary text-muted-foreground transition-transform">
                <Upload className="w-6 h-6 text-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                  {selectedFile ? 'Select different icon' : 'Upload Website Tab Icon'}
                </p>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                  Drag and drop or click to browse
                </p>
              </div>
              <div className="text-[9px] text-muted-foreground font-mono space-y-0.5">
                <div>FORMATS: PNG, ICO, SVG, JPG (converted to PNG)</div>
                <div>MAX FILE SIZE: 1 MB</div>
                <div>RECOMMENDED SIZE: 32×32, 48×48, or 64×64 pixels</div>
              </div>
            </div>

            {/* Selection details / Warning banner */}
            <AnimatePresence mode="wait">
              {dimensions && (
                <div 
                  className="bg-secondary/50 border border-border rounded-xl p-4 flex gap-3 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-250"
                >
                  {isRecommendedSize ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-1 text-left">
                    <p className="text-[10px] font-black uppercase text-foreground">
                      File Dimensions: {dimensions.width} × {dimensions.height} px
                    </p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide leading-relaxed">
                      {isRecommendedSize 
                        ? 'Ideal size! This icon meets the standard dimensions and will render razor-sharp on high-density displays.'
                        : 'Recommended standard sizes are exactly 32×32, 48×48, or 64×64 pixels. Other sizes are permitted but may cause browser-side downscaling artifacts.'}
                    </p>
                  </div>
                </div>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border">
              {selectedFile ? (
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <button
                    disabled={isUploading}
                    onClick={handleSave}
                    className="flex-1 sm:flex-initial slice-btn-primary px-6 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest bg-primary text-white hover:bg-black transition-all cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isUploading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {isUploading ? `Uploading (${Math.round(uploadProgress)}%)` : 'Save Changes'}
                  </button>
                  <button
                    disabled={isUploading}
                    onClick={handleCancelSelection}
                    className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground border border-border hover:bg-neutral-50 transition-all cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
                  No pending changes to commit
                </div>
              )}

              {faviconUrl && (
                <button
                  type="button"
                  onClick={handleRestoreDefault}
                  className="w-full sm:w-auto px-5 py-2.5 border-2 border-red-100 text-red-500 hover:bg-red-50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Restore Default
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Preview panel */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-border rounded-2xl p-6 shadow-xs space-y-6">
            <div className="space-y-1">
              <h3 className="text-xs font-black uppercase tracking-widest text-foreground">
                Live Browser Preview
              </h3>
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">
                Simulated representation of the browser address bar and active tab
              </p>
            </div>

            {/* Mock browser tab widget */}
            <div className="border border-border rounded-xl bg-neutral-100 overflow-hidden shadow-xs w-full">
              {/* Header bar */}
              <div className="bg-neutral-200 px-4 py-2 flex items-center gap-1.5 border-b border-border">
                {/* Simulated Mac Buttons */}
                <div className="w-2 h-2 rounded-full bg-red-400" />
                <div className="w-2 h-2 rounded-full bg-amber-400" />
                <div className="w-2 h-2 rounded-full bg-emerald-400" />
                
                {/* Active Tab */}
                <div className="ml-4 bg-white px-3 py-1 rounded-t-lg text-[9px] font-black text-foreground flex items-center gap-2 shadow-xs border border-b-0 border-border/40 max-w-[140px] truncate">
                  {previewUrl ? (
                    <img 
                      src={previewUrl} 
                      className="w-3.5 h-3.5 object-contain rounded shrink-0 bg-neutral-50" 
                      alt="Favicon Tab Preview" 
                      key={previewUrl}
                      onError={(e) => {
                        // Fallback
                        (e.target as HTMLImageElement).src = '/favicon.ico';
                      }}
                    />
                  ) : (
                    <div className="w-3.5 h-3.5 bg-neutral-200 rounded animate-pulse" />
                  )}
                  <span className="truncate">Fresh n Local</span>
                </div>
              </div>

              {/* URL Address Bar */}
              <div className="bg-white px-4 py-2.5 flex items-center gap-2 text-[10px] font-mono text-muted-foreground border-b border-border">
                <div className="bg-neutral-50 px-3 py-1 rounded-full w-full flex items-center gap-1 text-[9px] border border-border">
                  <span className="text-emerald-600 font-bold">https://</span>
                  <span className="text-foreground">www.freshnlocal.co</span>
                </div>
              </div>

              {/* Window body preview */}
              <div className="bg-neutral-50/50 p-6 text-center text-muted-foreground flex flex-col items-center justify-center min-h-[100px] gap-2">
                <div className="w-10 h-10 rounded-full border border-border/60 bg-white shadow-xs flex items-center justify-center text-muted-foreground">
                  {previewUrl ? (
                    <img 
                      src={previewUrl} 
                      className="w-5 h-5 object-contain" 
                      alt="Brand Emblem" 
                      key={previewUrl + '-emblem'}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/favicon.ico';
                      }}
                    />
                  ) : (
                    <Globe className="w-5 h-5" />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase text-foreground">
                    {selectedFile ? 'Pending Preview Mode' : 'Current Saved Aesthetics'}
                  </p>
                  <p className="text-[8px] uppercase tracking-wider">
                    {selectedFile 
                      ? 'Displaying local uncommitted file upload' 
                      : faviconUrl 
                        ? 'Displaying active custom Firebase storage icon' 
                        : 'Displaying fallback /favicon.ico file'}
                  </p>
                </div>
              </div>
            </div>

            {/* Branding status card */}
            <div className="bg-neutral-50 border border-border rounded-xl p-4 text-left font-mono text-[9px] uppercase tracking-wide text-muted-foreground space-y-1.5">
              <div className="flex justify-between">
                <span>Branding Sync Status:</span>
                <span className={faviconUrl ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                  {faviconUrl ? '● CUSTOM' : '● DEFAULT'}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Icon Registry Path:</span>
                <span className="truncate max-w-[150px] text-right text-foreground">
                  {faviconUrl ? 'Firebase Storage Bucket' : '/favicon.ico'}
                </span>
              </div>
              {selectedFile && (
                <div className="flex justify-between text-amber-600">
                  <span>Pending File Name:</span>
                  <span className="truncate max-w-[150px] text-right">{selectedFile.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
