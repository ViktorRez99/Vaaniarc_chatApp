import { AlertCircle, Download, File, LoaderCircle } from 'lucide-react';
import { decode } from 'blurhash';
import { useEffect, useRef } from 'react';
import {
  formatAttachmentSize,
  isImageAttachmentMetadata
} from '../utils/attachmentPreview';

const buildAspectRatio = (preview) => {
  const width = Number(preview?.width || 0);
  const height = Number(preview?.height || 0);

  if (!width || !height) {
    return '4 / 3';
  }

  return `${width} / ${height}`;
};

const BlurhashPreview = ({ preview }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!preview?.hash || !canvasRef.current) {
      return;
    }

    try {
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (!context) {
        return;
      }

      const outputWidth = 48;
      const outputHeight = Math.max(1, Math.round(
        outputWidth / Math.max(0.25, Number(preview.width || 1) / Math.max(1, Number(preview.height || 1)))
      ));
      const pixels = decode(preview.hash, outputWidth, outputHeight);
      const imageData = context.createImageData(outputWidth, outputHeight);

      imageData.data.set(pixels);
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      context.putImageData(imageData, 0, 0);
    } catch (error) {
      console.warn('Failed to decode attachment preview blurhash:', error);
    }
  }, [preview]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 h-full w-full object-cover"
      aria-hidden="true"
    />
  );
};

const MessageAttachmentCard = ({
  message,
  isOwn = false,
  onDownload = null
}) => {
  const fileDetails = (
    message?.decryptedFileMetadata
    || message?.content?.file?.decryptedMetadata
    || message?.content?.file
    || message?.fileMetadata
    || null
  );
  const localPreviewUrl = message?.localAttachmentPreviewUrl || null;
  const preview = fileDetails?.preview || null;
  const isImage = Boolean(localPreviewUrl || isImageAttachmentMetadata(fileDetails));
  const sizeLabel = formatAttachmentSize(fileDetails?.size);
  const uploadState = message?.uploadState || null;
  const statusLabel = uploadState === 'uploading'
    ? 'Uploading'
    : uploadState === 'failed'
      ? 'Upload failed'
      : null;
  const isDisabled = uploadState === 'uploading' || uploadState === 'failed';
  const Wrapper = typeof onDownload === 'function' ? 'button' : 'div';
  const wrapperProps = typeof onDownload === 'function'
    ? {
        type: 'button',
        onClick: () => {
          if (!isDisabled) {
            onDownload(message);
          }
        }
      }
    : {};

  useEffect(() => (
    () => {
      if (localPreviewUrl?.startsWith('blob:') && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(localPreviewUrl);
      }
    }
  ), [localPreviewUrl]);

  return (
    <Wrapper
      {...wrapperProps}
      className={`w-full overflow-hidden rounded-xl border text-left transition-colors ${
        isOwn
          ? 'border-white/10 bg-white/5 hover:bg-white/10'
          : 'border-black/15 bg-black/15 hover:bg-black/20'
      } ${isDisabled ? 'cursor-default' : 'cursor-pointer'}`}
      disabled={typeof onDownload === 'function' ? isDisabled : undefined}
    >
      <div className="relative">
        {isImage ? (
          <div
            className="relative overflow-hidden bg-black/30"
            style={{ aspectRatio: buildAspectRatio(preview) }}
          >
            {localPreviewUrl ? (
              <img
                src={localPreviewUrl}
                alt={fileDetails?.originalName || 'Attachment preview'}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : preview?.kind === 'blurhash' ? (
              <BlurhashPreview preview={preview} />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <File className="h-10 w-10 text-white/50" />
              </div>
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          </div>
        ) : (
          <div className="flex items-center justify-center bg-black/20 px-4 py-6">
            <File className="h-9 w-9 text-white/70" />
          </div>
        )}

        {statusLabel && (
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg backdrop-blur">
            {uploadState === 'uploading' ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5" />
            )}
            <span>{statusLabel}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 px-3 py-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-white">
            {fileDetails?.originalName || message?.content || 'Encrypted attachment'}
          </p>
          <p className="mt-1 text-xs text-white/70">
            {sizeLabel}
            {message?.isViewOnce ? ' • View once' : ''}
          </p>
        </div>

        {!isDisabled && typeof onDownload === 'function' && (
          <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
            isOwn ? 'bg-white/15' : 'bg-black/20'
          }`}>
            <Download className="h-4 w-4 text-white/80" />
          </div>
        )}
      </div>
    </Wrapper>
  );
};

export default MessageAttachmentCard;
