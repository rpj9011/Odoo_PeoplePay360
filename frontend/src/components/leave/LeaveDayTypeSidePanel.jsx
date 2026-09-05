import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ScheduleIcon from '@mui/icons-material/Schedule';
import { DAY_TYPE_OPTIONS, getDayTypeConfig } from '../../utils/leaveDayTypeConfig';
import { getLeaveSidePanelPosition, LEAVE_MODAL_SELECTOR } from '../../utils/leaveSidePanelPosition';
import '../../styles/LeaveSidePanel.css';

const LeaveDayTypeSidePanel = ({ value, onChange, open, onOpenChange }) => {
    const [position, setPosition] = useState({ left: 0, top: 0 });

    const updatePosition = useCallback(() => {
        setPosition(getLeaveSidePanelPosition(LEAVE_MODAL_SELECTOR, 'right'));
    }, []);

    const openPanel = () => {
        updatePosition();
        onOpenChange(true);
    };

    const closePanel = () => onOpenChange(false);

    const selectDayType = (dayType) => {
        onChange(dayType);
        closePanel();
    };

    useEffect(() => {
        if (!open) return undefined;

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        const onKeyDown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                closePanel();
            }
        };
        window.addEventListener('keydown', onKeyDown, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
            window.removeEventListener('keydown', onKeyDown, true);
        };
    }, [open, updatePosition]);

    const selected = getDayTypeConfig(value);
    const SelectedIcon = selected?.Icon;

    return (
        <div>
            <label className="leave-daytype-field-label" htmlFor="leave-daytype-trigger">
                Day Type
            </label>
            <button
                id="leave-daytype-trigger"
                type="button"
                className={`leave-daytype-trigger${open ? ' is-open' : ''}`}
                onClick={openPanel}
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <span className="leave-daytype-trigger-content">
                    {SelectedIcon && (
                        <span className="leave-daytype-trigger-icon-wrap">
                            <SelectedIcon sx={{ fontSize: 18 }} aria-hidden />
                        </span>
                    )}
                    <span className="leave-daytype-trigger-value">
                        {selected?.label || value || 'Select day type'}
                    </span>
                </span>
                <KeyboardArrowDownIcon className="leave-daytype-trigger-chevron" sx={{ fontSize: 20 }} />
            </button>

            {open &&
                createPortal(
                    <>
                        <button
                            type="button"
                            className="leave-side-backdrop"
                            aria-label="Close day type picker"
                            onClick={closePanel}
                        />
                        <div
                            className="leave-side-panel leave-side-panel--right leave-daytype-panel"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Select day type"
                            style={{ left: `${position.left}px`, top: `${position.top}px` }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="leave-side-header leave-daytype-header">
                                <div>
                                    <h4>Day type</h4>
                                    <p>How much of the day are you taking off?</p>
                                </div>
                                <button
                                    type="button"
                                    className="leave-side-close"
                                    onClick={closePanel}
                                    aria-label="Close"
                                >
                                    <CloseIcon sx={{ fontSize: 16 }} />
                                </button>
                            </div>

                            <div className="leave-side-body leave-daytype-body">
                                {DAY_TYPE_OPTIONS.map((option) => {
                                    const isSelected = value === option.value;
                                    const Icon = option.Icon;
                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            className={`leave-daytype-option${isSelected ? ' is-selected' : ''}`}
                                            onClick={() => selectDayType(option.value)}
                                        >
                                            <span className="leave-daytype-option-icon-wrap">
                                                <Icon sx={{ fontSize: 22 }} aria-hidden />
                                            </span>
                                            <span className="leave-daytype-option-text">
                                                <span className="leave-daytype-option-title">{option.label}</span>
                                                <span className="leave-daytype-option-desc">{option.description}</span>
                                            </span>
                                            {isSelected && (
                                                <CheckCircleIcon
                                                    className="leave-daytype-option-check"
                                                    sx={{ fontSize: 20 }}
                                                    aria-hidden
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="leave-daytype-footer">
                                <ScheduleIcon sx={{ fontSize: 14 }} aria-hidden />
                                <span>Half-day options follow your company shift timings</span>
                            </div>
                        </div>
                    </>,
                    document.body
                )}
        </div>
    );
};

export default LeaveDayTypeSidePanel;
