// frontend/src/components/onboarding/OnboardingOrchestrator.jsx
// Sits at the top of the protected layout and manages the onboarding flow.
//
// Flow:
//   1. OnboardingContext enrolls eligible new employees via /first-login
//   2. Renders the policy modal (blocks entire UI) — Step 1
//   3. Renders the app tour (after policy) — Step 2
//   4. Profile banner is handled separately in ProfilePage
//
// IMPORTANT: Admin and HR users skip onboarding entirely.
// Pre-feature employees (created before onboarding launch) never see acknowledgement.
// The correct dashboard is already rendered by DashboardRouter in App.jsx
// before this component runs — this component never forces a dashboard render.

import React from 'react';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import OnboardingPolicyModal from './OnboardingPolicyModal';
import AppTour from './AppTour';

const OnboardingOrchestrator = () => {
    const { user, authStatus } = useAuth();
    const {
        statusLoaded,
        showPolicyModal,
        showTour,
    } = useOnboarding();

    // Wait until auth and onboarding status are both resolved
    if (!statusLoaded || authStatus !== 'authenticated') return null;

    // Admin and HR: skip all onboarding UI completely
    if (user?.role === 'Admin' || user?.role === 'HR') return null;

    return (
        <>
            {/* Step 1 — Policy modal: full-screen, blocks all interaction */}
            {showPolicyModal && <OnboardingPolicyModal />}

            {/* Step 2 — Guided tour: starts with welcome screen, then driver.js */}
            {showTour && <AppTour />}
        </>
    );
};

export default OnboardingOrchestrator;
