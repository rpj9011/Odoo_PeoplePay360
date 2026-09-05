import { useState, useEffect, useRef } from 'react';

/**
 * DateSelectInput
 * DD / Month / YYYY segments inside a single bordered box —
 * visually identical to every other .pm-input on the form.
 * Value in/out: "YYYY-MM-DD" (ISO 8601).
 */

const MONTHS = [
    { num: 1,  name: 'January'   },
    { num: 2,  name: 'February'  },
    { num: 3,  name: 'March'     },
    { num: 4,  name: 'April'     },
    { num: 5,  name: 'May'       },
    { num: 6,  name: 'June'      },
    { num: 7,  name: 'July'      },
    { num: 8,  name: 'August'    },
    { num: 9,  name: 'September' },
    { num: 10, name: 'October'   },
    { num: 11, name: 'November'  },
    { num: 12, name: 'December'  },
];

const buildYears = () => {
    const cur = new Date().getFullYear();
    const arr = [];
    for (let y = cur + 10; y >= cur - 100; y--) arr.push(y);
    return arr;
};
const YEARS = buildYears();

const getDaysInMonth = (month, year) => {
    if (!month) return 31;
    return new Date(year || 2000, month, 0).getDate();
};

const parseISO = (iso) => {
    if (!iso || typeof iso !== 'string') return { day: '', month: '', year: '' };
    const [y, m, d] = iso.split('-');
    return {
        year:  y ? parseInt(y,  10) : '',
        month: m ? parseInt(m,  10) : '',
        day:   d ? parseInt(d,  10) : '',
    };
};

const DateSelectInput = ({ value, onChange }) => {
    const [parts, setParts]     = useState(() => parseISO(value));
    const [focused, setFocused] = useState(false);
    const wrapRef               = useRef(null);

    useEffect(() => { setParts(parseISO(value)); }, [value]);

    const daysInMonth = getDaysInMonth(parts.month, parts.year);
    const days = [];
    for (let d = 1; d <= daysInMonth; d++) days.push(d);

    const update = (field, raw) => {
        const val  = raw === '' ? '' : parseInt(raw, 10);
        const next = { ...parts, [field]: val };

        if (field === 'month' || field === 'year') {
            const max = getDaysInMonth(
                field === 'month' ? val : next.month,
                field === 'year'  ? val : next.year,
            );
            if (next.day && next.day > max) next.day = max;
        }

        setParts(next);

        if (next.year && next.month && next.day) {
            const y = String(next.year).padStart(4, '0');
            const m = String(next.month).padStart(2, '0');
            const d = String(next.day).padStart(2, '0');
            onChange(`${y}-${m}-${d}`);
        } else {
            onChange('');
        }
    };

    const handleFocus = () => setFocused(true);
    const handleBlur  = (e) => {
        if (wrapRef.current && !wrapRef.current.contains(e.relatedTarget)) {
            setFocused(false);
        }
    };

    return (
        <div
            ref={wrapRef}
            className={`dsi-wrap${focused ? ' dsi-wrap--focused' : ''}`}
        >
            {/* Day */}
            <select
                className="dsi-seg"
                value={parts.day}
                onChange={(e) => update('day', e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
            >
                <option value="">DD</option>
                {days.map(d => (
                    <option key={d} value={d}>{String(d).padStart(2, '0')}</option>
                ))}
            </select>

            <span className="dsi-divider" aria-hidden="true" />

            {/* Month */}
            <select
                className="dsi-seg dsi-seg-month"
                value={parts.month}
                onChange={(e) => update('month', e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
            >
                <option value="">Month</option>
                {MONTHS.map(m => (
                    <option key={m.num} value={m.num}>{m.name}</option>
                ))}
            </select>

            <span className="dsi-divider" aria-hidden="true" />

            {/* Year */}
            <select
                className="dsi-seg dsi-seg-year"
                value={parts.year}
                onChange={(e) => update('year', e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
            >
                <option value="">YYYY</option>
                {YEARS.map(y => (
                    <option key={y} value={y}>{y}</option>
                ))}
            </select>
        </div>
    );
};

export default DateSelectInput;
