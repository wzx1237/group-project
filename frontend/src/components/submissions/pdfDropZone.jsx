/**
 * Drag-and-drop zone for uploading combined or single scanned student exam PDFs.
 * @param {Object} props
 * @param {(files: File[]) => Promise<void>} props.onFilesSelected - Uploads PDF batch for cover-page splitting and OCR
 * @param {boolean} props.isUploading - Whether a batch upload and split job is currently running
 * @param {number} [props.uploadProgress] - Percentage progress of current upload/split operation
 */
export function PdfDropzone({ onFilesSelected, isUploading, uploadProgress }) {}
