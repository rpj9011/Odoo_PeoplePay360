// frontend/src/context/OnboardingContext.jsx
// Manages the onboarding flow state. Works alongside AuthContext without duplicating
// any auth logic. Reads onboarding status from the user object (returned by /api/auth/me).

import React, {
    createContext, useContext, useState, useCallback, useEffect, useRef
} from 'react';
import { useAuth } from './AuthContext';
import api from '../api/axios';

const OnboardingContext = createContext(null);

// Steps in order:
// 0 = not started / loading
// 1 = policy popup
// 2 = app tour
// 3 = profile completion prompt
// 4 = fully complete (don't show anything)
const STEP = {
    LOADING:  0,
    POLICY:   1,
    TOUR:     2,
    PROFILE:  3,
    DONE:     4,
};

export const OnboardingProvider = ({ children }) => {
    const { user, authStatus, updateUserContext } = useAuth();
    const [step, setStep] = useState(STEP.LOADING);
    const [mandatoryPolicy, setMandatoryPolicy] = useState(null);
    const [statusLoaded, setStatusLoaded] = useState(false);
    const [policyAcceptancePending, setPolicyAcceptancePending] = useState(false);
    const [tourPending, setTourPending] = useState(false);
    const firstLoginApiCalled = useRef(false);

    // New state for standalone policy acknowledgements (for existing employees)
    const [pendingPolicies, setPendingPolicies] = useState([]);
    const [standalonePolicyModalOpen, setStandalonePolicyModalOpen] = useState(false);
    const [currentStandalonePolicy, setCurrentStandalonePolicy] = useState(null);

    // Determine which step the user is at based on their onboarding object.
    // This is purely derived — never stores its own copy of user data.
    // Caller must only invoke this for employees eligible for onboarding
    // (created after the feature start date, or admin-forced).
    const computeStep = useCallback((onboarding, policy) => {
        if (!onboarding) return STEP.DONE;

        if (onboarding.completed) return STEP.DONE;

        // If there is no mandatory policy, skip the policy step
        const hasMandatoryPolicy = !!policy;

        if (!onboarding.policyAccepted && hasMandatoryPolicy) return STEP.POLICY;
        if (!onboarding.tourCompleted) return STEP.TOUR;
        if (!onboarding.profileCompleted) return STEP.PROFILE;
        return STEP.DONE;
    }, []);

    // Load onboarding status from backend (includes mandatory policy reference)
    const loadStatus = useCallback(async () => {
        if (!user || authStatus !== 'authenticated') return;

        // Skip onboarding for Admin and HR
        if (user.role === 'Admin' || user.role === 'HR') {
            setStep(STEP.DONE);
            setStatusLoaded(true);
            return;
        }

        try {
            const { data } = await api.get('/onboarding/status');
            setMandatoryPolicy(data.mandatoryPolicy || null);

            // Check for pending standalone policy acknowledgements (for all employees)
            loadPendingPolicies();

            // Pre-feature / non-eligible employees never see acknowledgement,
            // even if they were wrongly enrolled earlier.
            if (!data.isNewOnboardingEmployee) {
                setStep(STEP.DONE);
                return;
            }

            let ob = data.onboarding || user.onboarding || {};

            // Eligible new employee — enroll on first login if not yet recorded
            if (!ob.firstLoginCompleted && !firstLoginApiCalled.current) {
                firstLoginApiCalled.current = true;
                try {
                    const { data: fl } = await api.post('/onboarding/first-login');
                    if (fl.isNewOnboardingEmployee === false) {
                        setStep(STEP.DONE);
                        return;
                    }
                    ob = fl.onboarding || ob;
                    updateUserContext({ onboarding: ob });
                } catch (e) {
                    console.error('[Onboarding] recordFirstLogin failed:', e.message);
                }
            }

            setStep(computeStep(ob, data.mandatoryPolicy));
        } catch (e) {
            console.error('[Onboarding] Failed to load status:', e.message);
            // On error, don't block the user — let them proceed normally
            setStep(STEP.DONE);
        } finally {
            setStatusLoaded(true);
        }
    }, [user, authStatus, computeStep, updateUserContext]);

    // When auth becomes authenticated, load status once
    useEffect(() => {
        if (authStatus === 'authenticated' && user && !statusLoaded) {
            loadStatus();
        }
        if (authStatus === 'unauthenticated') {
            setStep(STEP.LOADING);
            setStatusLoaded(false);
            firstLoginApiCalled.current = false;
        }
    }, [authStatus, user, statusLoaded, loadStatus]);

    // Record first login (idempotent — backend handles duplicates).
    // Prefer enrollment via loadStatus; this remains for orchestrator fallback.
    const recordFirstLogin = useCallback(async () => {
        if (firstLoginApiCalled.current) return;
        firstLoginApiCalled.current = true;
        try {
            const { data } = await api.post('/onboarding/first-login');
            if (data.isNewOnboardingEmployee === false) {
                setStep(STEP.DONE);
                return;
            }
            updateUserContext({ onboarding: data.onboarding });
            setStep(computeStep(data.onboarding, mandatoryPolicy));
        } catch (e) {
            console.error('[Onboarding] recordFirstLogin failed:', e.message);
        }
    }, [updateUserContext, computeStep, mandatoryPolicy]);

    // Called when employee starts reading the policy
    const recordReadingStart = useCallback(async () => {
        try {
            await api.post('/onboarding/policy/start-reading');
        } catch (e) {
            console.error('[Onboarding] recordReadingStart failed:', e.message);
        }
    }, []);

    // Called when employee accepts policy
    const acceptPolicy = useCallback(async (payload) => {
        setPolicyAcceptancePending(true);
        try {
            const { data } = await api.post('/onboarding/policy/accept', payload);
            updateUserContext({ onboarding: data.onboarding });
            setStep(STEP.TOUR);
            return { success: true };
        } catch (e) {
            const msg = e.response?.data?.error || 'Failed to accept policy.';
            return { success: false, error: msg };
        } finally {
            setPolicyAcceptancePending(false);
        }
    }, [updateUserContext]);

    // Called when employee finishes the tour
    const completeTour = useCallback(async () => {
        setTourPending(true);
        try {
            const { data } = await api.post('/onboarding/tour/complete');
            updateUserContext({ onboarding: data.onboarding });
            setStep(STEP.PROFILE);
        } catch (e) {
            console.error('[Onboarding] completeTour failed:', e.message);
        } finally {
            setTourPending(false);
        }
    }, [updateUserContext]);

    // Called only after all required profile fields are saved
    const completeProfile = useCallback(async () => {
        try {
            const { data } = await api.post('/onboarding/profile/complete');
            updateUserContext({ onboarding: data.onboarding });
            setStep(STEP.DONE);
            return { success: true };
        } catch (e) {
            const msg = e.response?.data?.error || 'Failed to complete onboarding.';
            console.error('[Onboarding] completeProfile failed:', msg);
            return { success: false, error: msg };
        }
    }, [updateUserContext]);

    // Dismiss profile reminder (doesn't complete it — just hides the banner temporarily)
    const dismissProfileBanner = useCallback(() => {
        setStep(STEP.DONE);
    }, []);

    // ─── Standalone Policy Acknowledgement Functions ─────────────────────────────

    // Load pending policies for existing employees
    const loadPendingPolicies = useCallback(async () => {
        if (!user || authStatus !== 'authenticated') return;
        if (user.role === 'Admin' || user.role === 'HR') return;

        try {
            const { data } = await api.get('/onboarding/pending-policies');
            setPendingPolicies(data.pendingPolicies || []);
            
            // Auto-show modal if there are pending policies
            if (data.pendingPolicies && data.pendingPolicies.length > 0 && !standalonePolicyModalOpen) {
                setCurrentStandalonePolicy(data.pendingPolicies[0]);
                setStandalonePolicyModalOpen(true);
            }
        } catch (e) {
            console.error('[Onboarding] Failed to load pending policies:', e.message);
        }
    }, [user, authStatus, standalonePolicyModalOpen]);

    // Record reading start for standalone policy
    const recordStandaloneReadingStart = useCallback(async (logId) => {
        try {
            await api.post('/onboarding/policy/standalone-start-reading', { logId });
        } catch (e) {
            console.error('[Onboarding] recordStandaloneReadingStart failed:', e.message);
        }
    }, []);

    // Accept standalone policy
    const acceptStandalonePolicy = useCallback(async (payload) => {
        setPolicyAcceptancePending(true);
        try {
            const { data } = await api.post('/onboarding/policy/standalone-accept', payload);
            
            // Remove the accepted policy from pending list
            setPendingPolicies(prev => prev.filter(p => p.logId !== payload.logId));
            
            // Close modal and show next pending policy if any
            const remaining = pendingPolicies.filter(p => p.logId !== payload.logId);
            if (remaining.length > 0) {
                setCurrentStandalonePolicy(remaining[0]);
            } else {
                setStandalonePolicyModalOpen(false);
                setCurrentStandalonePolicy(null);
            }
            
            return { success: true };
        } catch (e) {
            const msg = e.response?.data?.error || 'Failed to accept policy.';
            return { success: false, error: msg };
        } finally {
            setPolicyAcceptancePending(false);
        }
    }, [pendingPolicies]);

    // Manually open standalone policy modal
    const openStandalonePolicyModal = useCallback((policyData = null) => {
        if (policyData) {
            setCurrentStandalonePolicy(policyData);
        } else if (pendingPolicies.length > 0) {
            setCurrentStandalonePolicy(pendingPolicies[0]);
        }
        setStandalonePolicyModalOpen(true);
    }, [pendingPolicies]);

    // Close standalone policy modal
    const closeStandalonePolicyModal = useCallback(() => {
        setStandalonePolicyModalOpen(false);
        setCurrentStandalonePolicy(null);
    }, []);

    const value = {
        STEP,
        step,
        mandatoryPolicy,
        statusLoaded,
        policyAcceptancePending,
        tourPending,
        isOnboardingActive: step > STEP.LOADING && step < STEP.DONE,
        showPolicyModal: step === STEP.POLICY,
        showTour: step === STEP.TOUR,
        showProfilePrompt: step === STEP.PROFILE,
        recordFirstLogin,
        recordReadingStart,
        acceptPolicy,
        completeTour,
        completeProfile,
        dismissProfileBanner,
        reloadStatus: loadStatus,
        // Standalone policy acknowledgement
        pendingPolicies,
        standalonePolicyModalOpen,
        currentStandalonePolicy,
        loadPendingPolicies,
        recordStandaloneReadingStart,
        acceptStandalonePolicy,
        openStandalonePolicyModal,
        closeStandalonePolicyModal,
    };

    return (
        <OnboardingContext.Provider value={value}>
            {children}
        </OnboardingContext.Provider>
    );
};

export const useOnboarding = () => {
    const ctx = useContext(OnboardingContext);
    if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
    return ctx;
};

export default OnboardingContext;
