// frontend/src/pages/ProbationPage.jsx
// Independent Probation Tracker Page (extracted from Analytics module)

import React from 'react';
import ProbationTracker from '../components/ProbationTracker';
import '../styles/Page.css';

const ProbationPage = () => {
  return (
    <div className="dashboard-page probation-page-layout">
      <ProbationTracker />
    </div>
  );
};

export default ProbationPage;
