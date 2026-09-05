import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import CloseIcon from '@mui/icons-material/Close';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import CategoryIcon from '@mui/icons-material/Category';
import {
    LEAVE_CATEGORY_CONFIG,
    LEAVE_CATEGORY_PLACEHOLDER,
    SPECIAL_CASES,
    STANDARD_LEAVES,
} from '../../utils/leaveCategoryConfig';
import { getLeaveSidePanelPosition, LEAVE_MODAL_SELECTOR } from '../../utils/leaveSidePanelPosition';
import '../../styles/LeaveSidePanel.css';

const LeaveCategorySidePanel = ({
    value,
    onChange,
    allowedLeaveTypes,
    showError = false,
    open,
    onOpenChange,
}) => {
    const [position, setPosition] = useState({ left: 0, top: 0 });

    const updatePosition = useCallback(() => {
        setPosition(getLeaveSidePanelPosition(LEAVE_MODAL_SELECTOR, 'right'));
    }, []);

    const openPanel = () => {
        updatePosition();
        onOpenChange(true);
    };

    const closePanel = () => onOpenChange(false);

    const selectCategory = (category) => {
        onChange(category);
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

    const config = value ? LEAVE_CATEGORY_CONFIG[value] : null;
    const SelectedIcon = config?.Icon;

    const renderOption = (categoryValue) => {
        const { label, description, Icon } = LEAVE_CATEGORY_CONFIG[categoryValue];
        const isSelected = value === categoryValue;
        return (
            <button
                key={categoryValue}
                type="button"
                className={`leave-category-option${isSelected ? ' is-selected' : ''}`}
                onClick={() => selectCategory(categoryValue)}
            >
                <Icon className="leave-category-option-icon" sx={{ fontSize: 22 }} aria-hidden />
                <span>
                    <p className="leave-category-option-title">{label}</p>
                    <p className="leave-category-option-desc">{description}</p>
                </span>
            </button>
        );
    };

    return (
        <div>
            <label
                className={`leave-category-field-label${showError ? ' has-error' : ''}`}
                htmlFor="leave-category-trigger"
            >
                Leave Category <span className="required" aria-label="required">*</span>
            </label>
            <button
                id="leave-category-trigger"
                type="button"
                className={`leave-category-trigger${open ? ' is-open' : ''}${showError ? ' has-error' : ''}`}
                onClick={openPanel}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-invalid={showError}
                aria-describedby="leave-category-help"
            >
                <span className="leave-category-trigger-content">
                    {!value ? (
                        <>
                            <CategoryIcon sx={{ fontSize: 20, color: '#9CA3AF' }} aria-hidden />
                            <span className="leave-category-trigger-value leave-category-trigger-placeholder">
                                {LEAVE_CATEGORY_PLACEHOLDER}
                            </span>
                        </>
                    ) : (
                        <>
                            {SelectedIcon && <SelectedIcon sx={{ fontSize: 20, color: '#6B7280' }} aria-hidden />}
                            <span className="leave-category-trigger-value">{config.label}</span>
                        </>
                    )}
                </span>
                <KeyboardArrowDownIcon className="leave-category-trigger-chevron" sx={{ fontSize: 20 }} />
            </button>

            {open &&
                createPortal(
                    <>
                        <button
                            type="button"
                            className="leave-side-backdrop"
                            aria-label="Close leave category picker"
                            onClick={closePanel}
                        />
                        <div
                            className="leave-side-panel leave-side-panel--right"
                            role="dialog"
                            aria-modal="true"
                            aria-label="Select leave category"
                            style={{ left: `${position.left}px`, top: `${position.top}px` }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="leave-side-header">
                                <div>
                                    <h4>Leave category</h4>
                                    <p>Choose the type of leave you need</p>
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

                            <div className="leave-side-body">
                                <div className="leave-category-group-label">STANDARD LEAVES</div>
                                {STANDARD_LEAVES.filter((v) => allowedLeaveTypes.includes(v)).map(renderOption)}
                                <div className="leave-category-divider" />
                                <div className="leave-category-group-label">SPECIAL CASES</div>
                                {SPECIAL_CASES.filter((v) => allowedLeaveTypes.includes(v)).map(renderOption)}
                            </div>
                        </div>
                    </>,
                    document.body
                )}
        </div>
    );
};

export default LeaveCategorySidePanel;
