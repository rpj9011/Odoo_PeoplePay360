import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
    CircularProgress,
    IconButton,
    Tooltip,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import FreeBreakfastOutlinedIcon from '@mui/icons-material/FreeBreakfastOutlined';
import RestaurantOutlinedIcon from '@mui/icons-material/RestaurantOutlined';
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutline';
import TimerOffOutlinedIcon from '@mui/icons-material/TimerOffOutlined';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import api from '../api/axios';
import '../styles/BulkAttendanceAssistant.css';

const ACTION_META = {
    refresh_live_attendance: {
        label: 'Refresh live attendance',
        shortLabel: 'Refresh attendance',
        icon: RefreshIcon,
    },
    stop_tea_breaks: {
        label: 'Stop all tea breaks',
        shortLabel: 'Stop tea breaks',
        icon: FreeBreakfastOutlinedIcon,
    },
    end_lunch_breaks: {
        label: 'End all lunch breaks',
        shortLabel: 'End lunch breaks',
        icon: RestaurantOutlinedIcon,
    },
    end_other_breaks: {
        label: 'End all other breaks',
        shortLabel: 'End other breaks',
        icon: PauseCircleOutlineIcon,
    },
    overwrite_tea_break_overruns: {
        label: 'Clear tea break overruns',
        shortLabel: 'Clear overruns',
        icon: TimerOffOutlinedIcon,
    },
};

const BulkAttendanceAssistant = ({ onActionComplete }) => {
    const [open, setOpen] = useState(false);
    const [preview, setPreview] = useState(null);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [executing, setExecuting] = useState(false);
    const [selectedAction, setSelectedAction] = useState(null);
    const [status, setStatus] = useState(null);
    
    // Check if we're on the admin attendance summary page to adjust FAB position
    const isAdminSummaryPage = window.location.pathname === '/admin/attendance-summary';

    const fetchPreview = useCallback(async () => {
        setLoadingPreview(true);
        try {
            const { data } = await api.get('/admin/bulk-attendance-actions/preview');
            setPreview(data?.actions ?? null);
        } catch (err) {
            setStatus({
                type: 'error',
                text: err.response?.data?.error || 'Could not load actions. Please try again.',
            });
        } finally {
            setLoadingPreview(false);
        }
    }, []);

    useEffect(() => {
        if (open) {
            setStatus(null);
            setSelectedAction(null);
            fetchPreview();
        }
    }, [open, fetchPreview]);

    useEffect(() => {
        if (!open) return undefined;
        const onKeyDown = (e) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [open]);

    const handleClose = () => {
        setOpen(false);
        setSelectedAction(null);
        setStatus(null);
    };

    const handleSelectAction = (actionKey) => {
        setStatus(null);
        setSelectedAction(actionKey);
    };

    const handleBack = () => {
        setSelectedAction(null);
        setStatus(null);
    };

    const handleConfirm = async () => {
        if (!selectedAction || executing) return;

        setExecuting(true);
        setStatus(null);

        try {
            const { data } = await api.post('/admin/bulk-attendance-actions/execute', {
                action: selectedAction,
                confirm: true,
            });

            const count = data?.processedCount ?? 0;
            setStatus({
                type: 'success',
                text: `${ACTION_META[selectedAction].label} completed (${count} processed).`,
            });
            setSelectedAction(null);
            setPreview(null);
            await fetchPreview();
            onActionComplete?.(data);
        } catch (err) {
            setStatus({
                type: 'error',
                text: err.response?.data?.error || 'Action failed. Please try again.',
            });
        } finally {
            setExecuting(false);
        }
    };

    const selectedPreview = selectedAction ? preview?.[selectedAction] : null;
    const selectedMeta = selectedAction ? ACTION_META[selectedAction] : null;

    // Overrun detail list for the tea break overruns action
    const renderOverrunDetails = (overrunDetails) => {
        if (!overrunDetails || overrunDetails.length === 0) {
            return (
                <p className="baa-overrun-empty">No overruns found for today.</p>
            );
        }
        return (
            <ul className="baa-overrun-list">
                {overrunDetails.map((item) => (
                    <li key={item.userId} className="baa-overrun-item">
                        <span className="baa-overrun-name">
                            {item.fullName}
                            {item.employeeCode ? (
                                <span className="baa-overrun-code"> · {item.employeeCode}</span>
                            ) : null}
                        </span>
                        <span className="baa-overrun-badge">
                            +{item.overrunMinutes} min over
                        </span>
                    </li>
                ))}
            </ul>
        );
    };

    const ui = (
        <>
            {open && (
                <button
                    type="button"
                    className="baa-backdrop"
                    aria-label="Close bulk actions"
                    onClick={handleClose}
                />
            )}

            <div className={`baa-root${isAdminSummaryPage ? ' baa-root--stacked' : ''}`}>
                {open && (
                    <div className="baa-panel" role="dialog" aria-label="Bulk actions">
                    <header className="baa-panel__header">
                        <div className="baa-panel__title-wrap">
                            {selectedAction ? (
                                <IconButton
                                    size="small"
                                    onClick={handleBack}
                                    aria-label="Back to actions"
                                    className="baa-panel__back"
                                    disabled={executing}
                                >
                                    <ArrowBackIcon fontSize="small" />
                                </IconButton>
                            ) : null}
                            <div className="baa-panel__titles">
                                <div className="baa-panel__title">
                                    {selectedAction ? 'Confirm' : 'Bulk actions'}
                                </div>
                                {selectedAction && (
                                    <div className="baa-panel__subtitle">{selectedMeta?.shortLabel}</div>
                                )}
                            </div>
                        </div>
                        <IconButton size="small" onClick={handleClose} aria-label="Close panel">
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </header>

                    <div className="baa-body">
                        {status && (
                            <div className={`baa-status baa-status--${status.type}`}>
                                {status.text}
                            </div>
                        )}

                        {loadingPreview && (
                            <div className="baa-loading">
                                <CircularProgress size={18} sx={{ color: '#d32f2f' }} />
                                <span>Loading…</span>
                            </div>
                        )}

                        {!loadingPreview && !selectedAction && preview && (
                            <ul className="baa-action-list">
                                {Object.entries(ACTION_META).map(([key, meta]) => {
                                    const Icon = meta.icon;
                                    const count = preview[key]?.affectedCount ?? 0;
                                    const isOverrun = key === 'overwrite_tea_break_overruns';
                                    return (
                                        <li key={key}>
                                            <button
                                                type="button"
                                                className="baa-action-item"
                                                onClick={() => handleSelectAction(key)}
                                            >
                                                <span className={`baa-action-item__icon${isOverrun ? ' baa-action-item__icon--amber' : ''}`}>
                                                    <Icon fontSize="small" />
                                                </span>
                                                <span className="baa-action-item__label">{meta.shortLabel}</span>
                                                <span className={`baa-action-item__count${isOverrun && count > 0 ? ' baa-action-item__count--amber' : ''}`}>
                                                    {count}
                                                </span>
                                                <ChevronRightIcon className="baa-action-item__chevron" fontSize="small" />
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}

                        {!loadingPreview && selectedAction && selectedPreview && (
                            <div className="baa-confirm">
                                <p className="baa-confirm__desc">{selectedPreview.description}</p>

                                {/* Special overrun detail section for tea break action */}
                                {selectedAction === 'overwrite_tea_break_overruns' && (
                                    <div className="baa-overrun-section">
                                        <div className="baa-overrun-header">
                                            Employees with overruns today
                                        </div>
                                        {renderOverrunDetails(selectedPreview.overrunDetails)}
                                    </div>
                                )}

                                <div className="baa-confirm__impact">
                                    <span className="baa-confirm__impact-label">Affected</span>
                                    <span className={`baa-confirm__impact-value${selectedAction === 'overwrite_tea_break_overruns' ? ' baa-confirm__impact-value--amber' : ''}`}>
                                        {selectedPreview.affectedCount}
                                    </span>
                                </div>
                                <div className="baa-confirm__actions">
                                    <button
                                        type="button"
                                        className={`baa-btn${selectedAction === 'overwrite_tea_break_overruns' ? ' baa-btn--amber' : ' baa-btn--primary'}`}
                                        onClick={handleConfirm}
                                        disabled={executing}
                                    >
                                        {executing && <CircularProgress size={16} color="inherit" />}
                                        {selectedAction === 'overwrite_tea_break_overruns' ? 'Clear overruns' : 'Run action'}
                                    </button>
                                    <button
                                        type="button"
                                        className="baa-btn baa-btn--ghost"
                                        onClick={handleBack}
                                        disabled={executing}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <Tooltip title={open ? 'Close bulk actions' : 'Bulk actions'} placement="left">
                <button
                    type="button"
                    className={`baa-fab${open ? ' baa-fab--open' : ''}`}
                    aria-label="Bulk actions"
                    aria-expanded={open}
                    onClick={() => setOpen((prev) => !prev)}
                >
                    {open ? <CloseIcon /> : <BoltOutlinedIcon />}
                </button>
            </Tooltip>
            </div>
        </>
    );

    return createPortal(ui, document.body);
};

export default BulkAttendanceAssistant;
