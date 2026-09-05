import { useState, useRef, useEffect } from 'react';

const countryCodes = [
    { code: '+91',  country: 'India',        flag: '🇮🇳' },
    { code: '+1',   country: 'USA / Canada',  flag: '🇺🇸' },
    { code: '+44',  country: 'UK',            flag: '🇬🇧' },
    { code: '+61',  country: 'Australia',     flag: '🇦🇺' },
    { code: '+971', country: 'UAE',           flag: '🇦🇪' },
    { code: '+65',  country: 'Singapore',     flag: '🇸🇬' },
    { code: '+60',  country: 'Malaysia',      flag: '🇲🇾' },
    { code: '+66',  country: 'Thailand',      flag: '🇹🇭' },
    { code: '+62',  country: 'Indonesia',     flag: '🇮🇩' },
    { code: '+86',  country: 'China',         flag: '🇨🇳' },
    { code: '+81',  country: 'Japan',         flag: '🇯🇵' },
    { code: '+82',  country: 'South Korea',   flag: '🇰🇷' },
    { code: '+33',  country: 'France',        flag: '🇫🇷' },
    { code: '+49',  country: 'Germany',       flag: '🇩🇪' },
    { code: '+39',  country: 'Italy',         flag: '🇮🇹' },
    { code: '+34',  country: 'Spain',         flag: '🇪🇸' },
    { code: '+31',  country: 'Netherlands',   flag: '🇳🇱' },
    { code: '+7',   country: 'Russia',        flag: '🇷🇺' },
    { code: '+27',  country: 'South Africa',  flag: '🇿🇦' },
    { code: '+55',  country: 'Brazil',        flag: '🇧🇷' },
    { code: '+52',  country: 'Mexico',        flag: '🇲🇽' },
    { code: '+64',  country: 'New Zealand',   flag: '🇳🇿' },
    { code: '+90',  country: 'Turkey',        flag: '🇹🇷' },
    { code: '+92',  country: 'Pakistan',      flag: '🇵🇰' },
    { code: '+880', country: 'Bangladesh',    flag: '🇧🇩' },
    { code: '+94',  country: 'Sri Lanka',     flag: '🇱🇰' },
    { code: '+977', country: 'Nepal',         flag: '🇳🇵' },
    { code: '+84',  country: 'Vietnam',       flag: '🇻🇳' },
    { code: '+63',  country: 'Philippines',   flag: '🇵🇭' },
    { code: '+20',  country: 'Egypt',         flag: '🇪🇬' },
];

const CountryCodeSelect = ({ value, onChange }) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const wrapRef = useRef(null);
    const searchRef = useRef(null);

    const selected = countryCodes.find(c => c.code === (value || '+91')) || countryCodes[0];

    const filtered = search.trim()
        ? countryCodes.filter(c =>
            c.country.toLowerCase().includes(search.toLowerCase()) ||
            c.code.includes(search)
          )
        : countryCodes;

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) {
                setOpen(false);
                setSearch('');
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Focus search when opening
    useEffect(() => {
        if (open && searchRef.current) {
            setTimeout(() => searchRef.current?.focus(), 50);
        }
    }, [open]);

    const handleSelect = (code) => {
        // Emit in the same shape as a native <select> onChange event
        onChange({ target: { value: code } });
        setOpen(false);
        setSearch('');
    };

    return (
        <div ref={wrapRef} className="ccs-wrap">
            {/* Trigger button */}
            <button
                type="button"
                className={`ccs-trigger${open ? ' ccs-trigger--open' : ''}`}
                onClick={() => setOpen(o => !o)}
                aria-haspopup="listbox"
                aria-expanded={open}
            >
                <span className="ccs-flag">{selected.flag}</span>
                <span className="ccs-code">{selected.code}</span>
                <svg className="ccs-chevron" width="10" height="6" viewBox="0 0 10 6" fill="none">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            </button>

            {/* Dropdown */}
            {open && (
                <div className="ccs-dropdown" role="listbox">
                    <div className="ccs-search-wrap">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className="ccs-search-icon">
                            <circle cx="11" cy="11" r="8" stroke="#9CA3AF" strokeWidth="2"/>
                            <path d="M21 21l-4.35-4.35" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round"/>
                        </svg>
                        <input
                            ref={searchRef}
                            type="text"
                            className="ccs-search"
                            placeholder="Search country..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="ccs-list">
                        {filtered.length === 0 ? (
                            <div className="ccs-empty">No results</div>
                        ) : (
                            filtered.map(c => (
                                <button
                                    key={c.code}
                                    type="button"
                                    role="option"
                                    aria-selected={c.code === selected.code}
                                    className={`ccs-option${c.code === selected.code ? ' ccs-option--active' : ''}`}
                                    onClick={() => handleSelect(c.code)}
                                >
                                    <span className="ccs-opt-flag">{c.flag}</span>
                                    <span className="ccs-opt-country">{c.country}</span>
                                    <span className="ccs-opt-code">{c.code}</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default CountryCodeSelect;
