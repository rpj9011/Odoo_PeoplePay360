// frontend/src/components/onboarding/OnboardingPolicyModal.jsx
// Fullscreen, undismissable policy compliance flow during onboarding.
// Uses CustomPdfViewer in onboarding-policy mode with in-PDF acknowledgment page.

import React, { useState, useEffect, useCallback } from 'react';
import { useOnboarding } from '../../context/OnboardingContext';
import CustomPdfViewer from '../CustomPdfViewer';

const OnboardingPolicyModal = () => {
    const {
        mandatoryPolicy,
        recordReadingStart,
        acceptPolicy,
        policyAcceptancePending,
    } = useOnboarding();

    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Block navigation shortcuts while policy modal is open
    useEffect(() => {
        const blockNavigation = (e) => {
            if (e.key === 'Escape') e.preventDefault();
            if (e.altKey && e.key === 'ArrowLeft') e.preventDefault();
        };
        const blockBack = () => {
            window.history.pushState(null, '', window.location.pathname);
        };
        window.addEventListener('keydown', blockNavigation, true);
        window.addEventListener('popstate', blockBack);
        window.history.pushState(null, '', window.location.pathname);
        return () => {
            window.removeEventListener('keydown', blockNavigation, true);
            window.removeEventListener('popstate', blockBack);
        };
    }, []);

    const handleAccept = useCallback(async ({ checkboxAcknowledged, scrolledToBottom, readingDurationSeconds }) => {
        if (!checkboxAcknowledged || !scrolledToBottom || submitting || !mandatoryPolicy) return;
        setError('');
        setSubmitting(true);
        const result = await acceptPolicy({
            policyId: mandatoryPolicy._id,
            policyVersion: mandatoryPolicy.version,
            checkboxAcknowledged: true,
            scrolledToBottom: true,
            readingDurationSeconds,
        });
        if (!result.success) {
            setError(result.error || 'Failed to submit. Please try again.');
        }
        setSubmitting(false);
    }, [acceptPolicy, mandatoryPolicy, submitting]);

    if (!mandatoryPolicy?._id) return null;

    return (
        <CustomPdfViewer
            mode="onboarding-policy"
            pdfUrl={`/policies-gridfs/${mandatoryPolicy._id}/file`}
            title={mandatoryPolicy.name || 'Company Policy'}
            version={mandatoryPolicy.version || '1.0'}
            effectiveDate={mandatoryPolicy.effectiveFrom}
            dismissable={false}
            onReadingStart={recordReadingStart}
            onAccept={handleAccept}
            acceptancePending={submitting || policyAcceptancePending}
            acceptError={error}
        />
    );
};

export default OnboardingPolicyModal;
