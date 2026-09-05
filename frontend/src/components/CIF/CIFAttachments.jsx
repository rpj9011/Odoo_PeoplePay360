import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  IconButton,
  CircularProgress,
  Alert,
  Chip,
  Tooltip
} from '@mui/material';
import {
  AttachFile as AttachFileIcon,
  CloudUpload as CloudUploadIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  InsertDriveFile as FileIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  Description as DocIcon,
  Visibility as VisibilityIcon
} from '@mui/icons-material';
import api from '../../api/axios';
import CIFFilePreview from './CIFFilePreview';

const CIFAttachments = ({ cifId, canEdit }) => {
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (cifId) {
      fetchAttachments();
    }
  }, [cifId]);

  const fetchAttachments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/admin/cif/${cifId}/attachments`);
      setAttachments(response.data);
    } catch (err) {
      console.error('Error fetching attachments:', err);
      setError(err.response?.data?.error || 'Failed to fetch attachments');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    // Validate file types
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    const invalidFiles = files.filter(file => !allowedTypes.includes(file.type));
    if (invalidFiles.length > 0) {
      setUploadError(`Invalid file type(s): ${invalidFiles.map(f => f.name).join(', ')}`);
      return;
    }

    // Validate file sizes (10MB max)
    const oversizedFiles = files.filter(file => file.size > 10 * 1024 * 1024);
    if (oversizedFiles.length > 0) {
      setUploadError(`File(s) exceed 10MB limit: ${oversizedFiles.map(f => f.name).join(', ')}`);
      return;
    }

    try {
      setUploading(true);
      setUploadError(null);

      const formData = new FormData();
      files.forEach(file => {
        formData.append('attachments', file);
      });

      const response = await api.post(`/admin/cif/${cifId}/attachments`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      // Add new attachments to state
      setAttachments(prev => [...response.data, ...prev]);
      
      // Reset file input
      event.target.value = '';
    } catch (err) {
      console.error('Error uploading files:', err);
      setUploadError(err.response?.data?.error || 'Failed to upload files');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (attachmentId, originalName) => {
    try {
      const response = await api.get(`/admin/cif/attachments/${attachmentId}/download`, {
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', originalName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading file:', err);
      setError('Failed to download file');
    }
  };

  const handleDelete = async (attachmentId) => {
    if (!window.confirm('Are you sure you want to delete this attachment?')) {
      return;
    }

    try {
      await api.delete(`/admin/cif/attachments/${attachmentId}`);
      setAttachments(prev => prev.filter(a => a._id !== attachmentId));
    } catch (err) {
      console.error('Error deleting attachment:', err);
      setError(err.response?.data?.error || 'Failed to delete attachment');
    }
  };

  const handlePreview = (attachment) => {
    setPreviewFile(attachment);
    setPreviewOpen(true);
  };

  const handleClosePreview = () => {
    setPreviewOpen(false);
    setPreviewFile(null);
  };

  const isPreviewable = (fileType) => {
    return fileType?.startsWith('image/') || fileType === 'application/pdf';
  };

  const getFileIcon = (fileType) => {
    if (fileType.startsWith('image/')) {
      return <ImageIcon sx={{ fontSize: '1.5rem', color: '#10B981' }} />;
    } else if (fileType === 'application/pdf') {
      return <PdfIcon sx={{ fontSize: '1.5rem', color: '#DC2626' }} />;
    } else if (fileType.includes('word') || fileType.includes('document')) {
      return <DocIcon sx={{ fontSize: '1.5rem', color: '#2563EB' }} />;
    }
    return <FileIcon sx={{ fontSize: '1.5rem', color: '#6B7280' }} />;
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <Box
      sx={{
        bgcolor: 'white',
        borderRadius: '12px',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.08)',
        p: 3,
        border: '1px solid #F3F4F6'
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AttachFileIcon sx={{ fontSize: '1.25rem', color: '#6B7280' }} />
          <Typography
            variant="overline"
            sx={{
              color: '#9CA3AF',
              fontWeight: 700,
              letterSpacing: '0.1em',
              fontSize: '0.6875rem'
            }}
          >
            ATTACHMENTS
          </Typography>
          {attachments.length > 0 && (
            <Chip
              label={attachments.length}
              size="small"
              sx={{
                bgcolor: '#DC2626',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.6875rem',
                height: '20px',
                minWidth: '20px',
                '& .MuiChip-label': {
                  px: 0.75
                }
              }}
            />
          )}
        </Box>

        {canEdit && (
          <Button
            variant="contained"
            component="label"
            startIcon={uploading ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <CloudUploadIcon />}
            disabled={uploading}
            sx={{
              bgcolor: '#DC2626',
              color: 'white',
              textTransform: 'none',
              fontWeight: 600,
              fontSize: '0.8125rem',
              px: 2,
              py: 0.75,
              borderRadius: '8px',
              boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
              '&:hover': {
                bgcolor: '#B91C1C',
                boxShadow: '0 4px 12px rgba(220, 38, 38, 0.3)'
              },
              '&:disabled': {
                bgcolor: '#E5E7EB',
                color: '#9CA3AF'
              }
            }}
          >
            {uploading ? 'Uploading...' : 'Upload Files'}
            <input
              type="file"
              hidden
              multiple
              accept="image/*,.pdf,.doc,.docx"
              onChange={handleFileSelect}
              disabled={uploading}
            />
          </Button>
        )}
      </Box>

      {/* Upload Error */}
      {uploadError && (
        <Alert
          severity="error"
          onClose={() => setUploadError(null)}
          sx={{
            mb: 2,
            borderRadius: '8px',
            fontSize: '0.875rem'
          }}
        >
          {uploadError}
        </Alert>
      )}

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          onClose={() => setError(null)}
          sx={{
            mb: 2,
            borderRadius: '8px',
            fontSize: '0.875rem'
          }}
        >
          {error}
        </Alert>
      )}

      {/* Loading */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress sx={{ color: '#DC2626' }} size={32} />
        </Box>
      ) : attachments.length === 0 ? (
        /* Empty State */
        <Box
          sx={{
            textAlign: 'center',
            py: 4,
            px: 2,
            bgcolor: '#F9FAFB',
            borderRadius: '8px',
            border: '1px dashed #D1D5DB'
          }}
        >
          <AttachFileIcon sx={{ fontSize: '3rem', color: '#D1D5DB', mb: 1 }} />
          <Typography
            variant="body2"
            sx={{
              color: '#9CA3AF',
              fontSize: '0.875rem',
              fontWeight: 500
            }}
          >
            No attachments uploaded yet
          </Typography>
        </Box>
      ) : (
        /* Attachments List */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {attachments.map((attachment) => (
            <Box
              key={attachment._id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 2,
                bgcolor: '#F9FAFB',
                borderRadius: '8px',
                border: '1px solid #E5E7EB',
                transition: 'all 0.2s',
                cursor: isPreviewable(attachment.fileType) ? 'pointer' : 'default',
                '&:hover': {
                  bgcolor: isPreviewable(attachment.fileType) ? '#F3F4F6' : '#F9FAFB',
                  borderColor: isPreviewable(attachment.fileType) ? '#D1D5DB' : '#E5E7EB',
                  transform: isPreviewable(attachment.fileType) ? 'translateY(-1px)' : 'none',
                  boxShadow: isPreviewable(attachment.fileType) ? '0 2px 8px rgba(0, 0, 0, 0.08)' : 'none'
                }
              }}
              onClick={() => isPreviewable(attachment.fileType) && handlePreview(attachment)}
            >
              {/* File Icon */}
              <Box sx={{ flexShrink: 0 }}>
                {getFileIcon(attachment.fileType)}
              </Box>

              {/* File Info */}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      color: '#111827',
                      fontSize: '0.875rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    {attachment.originalName}
                  </Typography>
                  {isPreviewable(attachment.fileType) && (
                    <Chip
                      label="Preview"
                      size="small"
                      icon={<VisibilityIcon sx={{ fontSize: '0.875rem' }} />}
                      sx={{
                        height: '20px',
                        fontSize: '0.6875rem',
                        fontWeight: 600,
                        bgcolor: '#DBEAFE',
                        color: '#1E40AF',
                        '& .MuiChip-icon': {
                          color: '#1E40AF'
                        }
                      }}
                    />
                  )}
                </Box>
                <Typography
                  variant="caption"
                  sx={{
                    color: '#6B7280',
                    fontSize: '0.75rem',
                    display: 'block'
                  }}
                >
                  {formatFileSize(attachment.fileSize)} • Uploaded by {attachment.uploadedBy?.fullName} • {formatDate(attachment.createdAt)}
                </Typography>
              </Box>

              {/* Actions */}
              <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                <Tooltip title="Download">
                  <IconButton
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(attachment._id, attachment.originalName);
                    }}
                    sx={{
                      color: '#6B7280',
                      '&:hover': {
                        bgcolor: '#E5E7EB',
                        color: '#374151'
                      }
                    }}
                  >
                    <DownloadIcon fontSize="small" />
                  </IconButton>
                </Tooltip>

                {canEdit && (
                  <Tooltip title="Delete">
                    <IconButton
                      size="small"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(attachment._id);
                      }}
                      sx={{
                        color: '#DC2626',
                        '&:hover': {
                          bgcolor: '#FEE2E2',
                          color: '#B91C1C'
                        }
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {/* File Preview Modal */}
      {previewOpen && previewFile && (
        <CIFFilePreview
          file={previewFile}
          onClose={handleClosePreview}
          onDownload={handleDownload}
        />
      )}
    </Box>
  );
};

export default CIFAttachments;
