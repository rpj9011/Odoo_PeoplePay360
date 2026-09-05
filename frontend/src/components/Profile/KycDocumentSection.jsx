// frontend/src/components/Profile/KycDocumentSection.jsx
// Employee-facing KYC document upload section, embedded inside ProfileMain's
// Identity & Bank card. Matches the PublicProfileForm / ProfilePage design exactly.
import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../../api/axios';

// ─── Document type config (mirrors backend catalogue) ────────────────────────
const KYC_TYPES = [
    { key: 'aadhaar',                 label: 'Aadhaar Card',                    isOptional: false },
    { key: 'pan',                     label: 'PAN Card',                        isOptional: false },
    { key: 'utility_bill',            label: 'Utility Bill',                    isOptional: false },
    { key: 'rent_agreement',          label: 'Rent Agreement',                  isOptional: false },
    { key: 'educational_certificate', label: 'Educational Certificates',        isOptional: false },
    { key: 'salary_slip',             label: 'Salary Slips',                    isOptional: false },
    { key: 'bank_statement',          label: 'Bank Statement',                  isOptional: false },
    { key: 'bank_details',            label: 'Bank Details / Cancelled Cheque', isOptional: false },
    { key: 'passport',                label: 'Passport',                        isOptional: true },
    { key: 'driving_license',         label: "Driver's License",                isOptional: true },
    { key: 'relieving_letter',        label: 'Relieving Letter',                isOptional: true },
    { key: 'experience_letter',       label: 'Experience Letter',               isOptional: true },
];

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

function getStatusMeta(status) {
    switch (status) {
        case 'verified':
            return { label: 'Verified', className: 'kyc-status--verified' };
        case 'rejected':
            return { label: 'Rejected', className: 'kyc-status--rejected' };
        case 'pending_review':
            return { label: 'Pending Review', className: 'kyc-status--pending' };
        default:
            return { label: 'Not Uploaded', className: 'kyc-status--none' };
    }
}

function getExt(filename = '') {
    const idx = filename.lastIndexOf('.');
    return idx === -1 ? '' : filename.slice(idx).toLowerCase();
}

function getMimeFromExt(ext) {
    const map = { '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png' };
    return map[ext] || 'application/octet-stream';
}

// ─── Single row component ──────────────────────────────────────────────────────
const KycRow = ({ typeMeta, document: doc, onUploaded, onView }) => {
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef(null);

    const statusMeta = getStatusMeta(doc?.status);

    const handleFileSelect = useCallback(async (file) => {
        setError('');
        setProgress(0);

        if (!file) return;

        // Client-side validation
        const ext = getExt(file.name);
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            setError(`Not allowed. Use: ${ALLOWED_EXTENSIONS.join(', ')}`);
            return;
        }
        if (file.size > MAX_SIZE_BYTES) {
            setError('File exceeds 5 MB limit.');
            return;
        }
        if (file.size === 0) {
            setError('File is empty.');
            return;
        }

        const mimeType = getMimeFromExt(ext);
        setUploading(true);

        try {
            // Step 1: request presigned PUT URL
            const { data: presignData } = await api.post('/kyc/request-upload', {
                documentType: typeMeta.key,
                originalFileName: file.name,
                mimeType,
                fileSize: file.size,
            });

            const { presignedPutUrl, storageKey } = presignData;

            // Step 2: PUT directly to R2 — file never touches our server
            setProgress(10);
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    setProgress(10 + Math.round((e.loaded / e.total) * 80));
                }
            });

            await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) resolve();
                    else reject(new Error(`R2 upload failed: HTTP ${xhr.status}`));
                };
                xhr.onerror = () => reject(new Error('Network error during upload.'));
                xhr.open('PUT', presignedPutUrl);
                xhr.setRequestHeader('Content-Type', mimeType);
                xhr.send(file);
            });

            setProgress(95);

            // Step 3: confirm upload → creates the metadata record
            const { data: confirmed } = await api.post('/kyc/confirm-upload', {
                documentType: typeMeta.key,
                storageKey,
                originalFileName: file.name,
                mimeType,
                fileSize: file.size,
            });

            setProgress(100);
            onUploaded(typeMeta.key, confirmed.document);
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Upload failed.';
            setError(msg);
        } finally {
            setUploading(false);
            setProgress(0);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }, [typeMeta.key, onUploaded]);

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) handleFileSelect(file);
    };

    const handleInputChange = (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelect(file);
    };

    return (
        <div className={`kyc-row${uploading ? ' kyc-row--uploading' : ''}`}>
            <div className="kyc-row-info">
                <span className="kyc-row-label">
                    {typeMeta.label}
                    {typeMeta.isOptional && (
                        <span className="pf-label-optional" style={{ marginLeft: 6 }}>Optional</span>
                    )}
                </span>
                <span className={`kyc-status ${statusMeta.className}`}>
                    {statusMeta.label}
                </span>
                {doc?.status === 'rejected' && doc?.rejectionReason && (
                    <span className="kyc-rejection-reason">
                        Reason: {doc.rejectionReason}
                    </span>
                )}
                {doc?.originalFileName && (
                    <span className="kyc-file-name">{doc.originalFileName}</span>
                )}
            </div>

            <div className="kyc-row-actions">
                {doc && (
                    <button
                        type="button"
                        className="kyc-btn kyc-btn--view"
                        onClick={() => onView(doc._id)}
                        disabled={uploading}
                        aria-label={`View ${typeMeta.label}`}
                    >
                        View
                    </button>
                )}

                <label
                    className={`kyc-btn kyc-btn--upload${uploading ? ' kyc-btn--disabled' : ''}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    role="button"
                    tabIndex={uploading ? -1 : 0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                    aria-label={doc ? `Re-upload ${typeMeta.label}` : `Upload ${typeMeta.label}`}
                >
                    {uploading ? (
                        <span className="kyc-spinner" aria-hidden="true" />
                    ) : (
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                    )}
                    {uploading ? (progress > 0 ? `${progress}%` : 'Uploading…') : (doc ? 'Replace' : 'Upload')}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        className="kyc-file-input"
                        onChange={handleInputChange}
                        disabled={uploading}
                        tabIndex={-1}
                        aria-hidden="true"
                    />
                </label>
            </div>

            {uploading && progress > 0 && (
                <div className="kyc-progress-bar-wrap" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="kyc-progress-bar-fill" style={{ width: `${progress}%` }} />
                </div>
            )}

            {error && (
                <span className="kyc-row-error" role="alert">⚠ {error}</span>
            )}
        </div>
    );
};

// ─── Main section ──────────────────────────────────────────────────────────────
const KycDocumentSection = () => {
    const [docMap, setDocMap] = useState({}); // key → doc | null
    const [loading, setLoading] = useState(true);
    const [viewLoading, setViewLoading] = useState(null); // docId | null
    const [viewError, setViewError] = useState('');

    // Load current KYC document statuses on mount
    useEffect(() => {
        let cancelled = false;
        api.get('/kyc/my-documents')
            .then(({ data }) => {
                if (cancelled) return;
                const map = {};
                for (const entry of data.documents) {
                    map[entry.key] = entry.document;
                }
                setDocMap(map);
            })
            .catch(console.error)
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, []);

    const handleUploaded = useCallback((typeKey, newDoc) => {
        setDocMap((prev) => ({ ...prev, [typeKey]: newDoc }));
    }, []);

    const handleView = useCallback(async (docId) => {
        setViewError('');
        setViewLoading(docId);
        try {
            const { data } = await api.get(`/kyc/view/${docId}`);
            window.open(data.presignedGetUrl, '_blank', 'noopener,noreferrer');
        } catch (err) {
            setViewError(err.response?.data?.error || 'Failed to open document. Please try again.');
        } finally {
            setViewLoading(null);
        }
    }, []);

    if (loading) {
        return (
            <div className="kyc-loading" aria-busy="true">
                <span className="kyc-spinner" />
                <span>Loading KYC documents…</span>
            </div>
        );
    }

    const required = KYC_TYPES.filter((t) => !t.isOptional);
    const optional = KYC_TYPES.filter((t) => t.isOptional);

    return (
        <div className="kyc-section">
            <div className="kyc-section-header">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <polyline points="10 9 9 9 8 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
                KYC / Compliance Documents
                <span className="kyc-badge-info">PDF, JPG, PNG · Max 5 MB</span>
            </div>

            {viewError && (
                <div className="kyc-view-error" role="alert">
                    ⚠ {viewError}
                    <button className="kyc-view-error-close" onClick={() => setViewError('')} aria-label="Dismiss">×</button>
                </div>
            )}

            <div className="kyc-group-label">Required Documents</div>
            <div className="kyc-list" role="list">
                {required.map((typeMeta) => (
                    <KycRow
                        key={typeMeta.key}
                        typeMeta={typeMeta}
                        document={docMap[typeMeta.key] || null}
                        onUploaded={handleUploaded}
                        onView={handleView}
                        viewLoading={viewLoading}
                    />
                ))}
            </div>

            <div className="kyc-group-label kyc-group-label--optional">
                Optional Documents
                <span className="kyc-optional-note">Not required to complete your profile</span>
            </div>
            <div className="kyc-list" role="list">
                {optional.map((typeMeta) => (
                    <KycRow
                        key={typeMeta.key}
                        typeMeta={typeMeta}
                        document={docMap[typeMeta.key] || null}
                        onUploaded={handleUploaded}
                        onView={handleView}
                        viewLoading={viewLoading}
                    />
                ))}
            </div>
        </div>
    );
};

export default KycDocumentSection;
