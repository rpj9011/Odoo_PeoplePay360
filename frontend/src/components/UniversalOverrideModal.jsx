/**
 * UniversalOverrideModal — Apple-style premium redesign
 * Clean whites, crisp typography, subtle depth, precise spacing.
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
    Dialog, DialogContent, DialogActions,
    Button, TextField, Typography, Alert,
    FormControl, Select, MenuItem,
    FormControlLabel, Checkbox,
    Box, Chip, Divider, Paper, IconButton, LinearProgress, Avatar,
} from '@mui/material';
import {
    CalendarToday, Groups, TuneRounded, CheckCircleOutline,
    ChevronLeft, ChevronRight, CloseRounded,
    NotesRounded, SyncAltRounded, BeachAccessRounded,
    ErrorOutlineRounded, InfoOutlined,
} from '@mui/icons-material';
import api from '../api/axios';
import { filterActiveEmployees } from '../utils/employeeFilterUtils';
import { getISTDateString } from '../utils/istTime';

/* ─────────────────────────── Design tokens ─────────────────────────── */
const C = {
    // Reds (70% white / 30% red theme)
    red:        '#E53935',
    redHover:   '#C62828',
    redSoft:    '#FFEBEE',
    redBorder:  '#FFCDD2',
    redText:    '#B71C1C',
    // Neutrals (Apple-inspired)
    bg:         '#F5F5F7',
    surface:    '#FFFFFF',
    border:     '#E5E5E7',
    borderFocus:'#C7C7CC',
    text:       '#1D1D1F',
    textSub:    '#6E6E73',
    textMuted:  '#86868B',
    // Status colours
    green:      '#34C759',
    greenSoft:  '#F0FDF4',
    amber:      '#FF9500',
    amberSoft:  '#FFF8E7',
    blue:       '#007AFF',
    blueSoft:   '#E8F4FD',
    purple:     '#AF52DE',
    purpleSoft: '#F5F0FF',
};

const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", sans-serif';

/* ─────────────────────────── Helpers ───────────────────────────────── */
function buildPresets(today) {
    const d = new Date(today);
    const fmt = (x) => x.toISOString().slice(0, 10);
    const add = (x, n) => { const r = new Date(x); r.setDate(r.getDate() + n); return r; };
    const lmEnd = new Date(d.getFullYear(), d.getMonth(), 0);
    const lmStart = new Date(lmEnd.getFullYear(), lmEnd.getMonth(), 1);
    const lwEnd = new Date(d); lwEnd.setDate(d.getDate() - d.getDay());
    const lwStart = new Date(lwEnd); lwStart.setDate(lwEnd.getDate() - 6);
    const cmStart = new Date(d.getFullYear(), d.getMonth(), 1);
    return [
        { label: 'Today',       start: today,        end: today },
        { label: 'Yesterday',   start: fmt(add(d,-1)), end: fmt(add(d,-1)) },
        { label: 'This Week',   start: fmt(lwStart),  end: today },
        { label: 'Last Week',   start: fmt(lwStart),  end: fmt(lwEnd) },
        { label: 'This Month',  start: fmt(cmStart),  end: today },
        { label: 'Last Month',  start: fmt(lmStart),  end: fmt(lmEnd) },
    ];
}

function fmtDisplay(s, e) {
    if (!s) return 'Select a date';
    const opts = { month: 'short', day: 'numeric', year: 'numeric' };
    const sd = new Date(s + 'T00:00:00').toLocaleDateString('en-IN', opts);
    if (!e || s === e) return sd;
    const ed = new Date(e + 'T00:00:00').toLocaleDateString('en-IN', opts);
    return `${sd} – ${ed}`;
}

/* ─────────────────────────── Mini Calendar ─────────────────────────── */
function MiniCalendar({ startDate, endDate, onStartChange, onEndChange, todayIST, selecting, useRange }) {
    const ref = startDate ? new Date(startDate) : new Date(todayIST);
    const [vy, setVY] = useState(ref.getFullYear());
    const [vm, setVM] = useState(ref.getMonth());
    const [hov, setHov] = useState(null);

    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const DAYS   = ['S','M','T','W','T','F','S'];
    const fmtD   = (y, m, d) => `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    const prev = () => vm === 0 ? (setVY(y=>y-1), setVM(11)) : setVM(m=>m-1);
    const next = () => vm === 11 ? (setVY(y=>y+1), setVM(0))  : setVM(m=>m+1);

    const click = (ds) => {
        if (ds > todayIST) return;
        if (!useRange) { onStartChange(ds); return; }
        if (selecting === 'start') { onStartChange(ds); }
        else if (ds < startDate) { onStartChange(ds); onEndChange(startDate); }
        else { onEndChange(ds); }
    };

    const inRange = (ds) => {
        if (!useRange || !startDate) return false;
        const eRef = hov || endDate || startDate;
        const lo = startDate < eRef ? startDate : eRef;
        const hi = startDate < eRef ? eRef : startDate;
        return ds > lo && ds < hi;
    };

    const first = new Date(vy, vm, 1).getDay();
    const last  = new Date(vy, vm+1, 0).getDate();
    const cells = [...Array(first).fill(null), ...Array.from({length:last}, (_,i)=>fmtD(vy,vm,i+1))];

    return (
        <Box sx={{ fontFamily: FONT }}>
            {/* Month Navigation */}
            <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:2.5 }}>
                <IconButton size="small" onClick={prev}
                    sx={{ 
                        width:32, height:32, 
                        borderRadius:'50%',
                        color:C.textSub, 
                        transition:'all 0.15s',
                        '&:hover':{ 
                            bgcolor:C.bg, 
                            transform:'scale(1.1)',
                            color:C.text,
                        } 
                    }}>
                    <ChevronLeft sx={{ fontSize:20 }}/>
                </IconButton>
                <Typography sx={{ fontWeight:600, fontSize:'0.9375rem', color:C.text, letterSpacing:'-0.015em', fontFamily:FONT }}>
                    {MONTHS[vm]} {vy}
                </Typography>
                <IconButton size="small" onClick={next}
                    sx={{ 
                        width:32, height:32, 
                        borderRadius:'50%',
                        color:C.textSub, 
                        transition:'all 0.15s',
                        '&:hover':{ 
                            bgcolor:C.bg, 
                            transform:'scale(1.1)',
                            color:C.text,
                        } 
                    }}>
                    <ChevronRight sx={{ fontSize:20 }}/>
                </IconButton>
            </Box>
            
            {/* Day Headers */}
            <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', mb:1.5, gap:0.5 }}>
                {DAYS.map((d,i) => (
                    <Typography key={i} align="center"
                        sx={{ 
                            fontSize:'0.6875rem', 
                            fontWeight:700, 
                            color:C.textMuted, 
                            textTransform:'uppercase', 
                            letterSpacing:'0.06em',
                            opacity:0.6,
                            fontFamily:FONT,
                        }}>
                        {d}
                    </Typography>
                ))}
            </Box>
            
            {/* Date Grid */}
            <Box sx={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:'4px' }}>
                {cells.map((ds, i) => {
                    if (!ds) return <Box key={`e${i}`} sx={{ aspectRatio:'1', width:'100%' }}/>;
                    const future  = ds > todayIST;
                    const isStart = ds === startDate;
                    const isEnd   = useRange && ds === endDate;
                    const inR     = inRange(ds);
                    const isToday = ds === todayIST;
                    const selected = isStart || isEnd;
                    return (
                        <Box key={ds}
                            onClick={() => !future && click(ds)}
                            onMouseEnter={() => !future && setHov(ds)}
                            onMouseLeave={() => setHov(null)}
                            sx={{
                                aspectRatio: '1',
                                width: '100%',
                                display:'flex', 
                                alignItems:'center', 
                                justifyContent:'center',
                                borderRadius: '50%',
                                bgcolor: selected ? C.red : inR ? 'rgba(229,57,53,0.08)' : 'transparent',
                                color: selected ? '#fff' : future ? C.textMuted : C.text,
                                cursor: future ? 'default' : 'pointer',
                                fontSize:'0.875rem',
                                fontWeight: selected ? 700 : isToday ? 600 : 400,
                                fontFamily: FONT,
                                border: isToday && !selected ? `2px solid ${C.red}` : 'none',
                                boxShadow: selected ? '0 2px 8px rgba(229,57,53,0.3)' : 'none',
                                transform: selected ? 'scale(1.05)' : 'scale(1)',
                                transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                                userSelect: 'none',
                                '&:hover': !future ? { 
                                    bgcolor: selected ? C.redHover : 'rgba(0,0,0,0.04)',
                                    transform: 'scale(1.05)',
                                    boxShadow: selected ? '0 4px 12px rgba(229,57,53,0.4)' : '0 2px 8px rgba(0,0,0,0.08)',
                                } : {},
                            }}
                        >
                            {parseInt(ds.slice(8))}
                        </Box>
                    );
                })}
            </Box>
        </Box>
    );
}

/* ─────────────────────────── Pill tab ──────────────────────────────── */
const PillTab = ({ active, onClick, icon, label }) => (
    <Box onClick={onClick}
        sx={{
            display:'flex', alignItems:'center', gap:0.75,
            px:2.5, py:1,
            borderRadius:'99px',
            bgcolor: active ? C.surface : 'transparent',
            boxShadow: active ? '0 2px 8px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.5)' : 'none',
            cursor:'pointer',
            transition:'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            userSelect:'none',
            transform: active ? 'scale(1)' : 'scale(0.98)',
            '&:hover': {
                bgcolor: active ? C.surface : 'rgba(0,0,0,0.03)',
                transform: 'scale(1)',
            },
        }}
    >
        <Box sx={{ color: active ? C.red : C.textMuted, display:'flex', fontSize:17, transition:'color 0.2s' }}>{icon}</Box>
        <Typography sx={{
            fontSize:'0.8125rem', fontWeight: active ? 600 : 500,
            color: active ? C.text : C.textMuted,
            fontFamily: FONT, whiteSpace:'nowrap',
            transition:'color 0.2s',
        }}>
            {label}
        </Typography>
    </Box>
);

/* ─────────────────────────── Type tile ─────────────────────────────── */
const TypeTile = ({ label, sublabel, color, softColor, active, onClick, dotColor }) => (
    <Box onClick={onClick}
        sx={{
            flex:1, minWidth:88,
            px:1.5, py:1.5,
            border:`2px solid ${active ? color : C.border}`,
            borderRadius:'14px',
            bgcolor: active ? softColor : C.surface,
            cursor:'pointer',
            transition:'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: active ? 'scale(1.02)' : 'scale(1)',
            boxShadow: active ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
            '&:hover':{ 
                borderColor:color, 
                bgcolor:softColor,
                transform:'scale(1.02)',
                boxShadow:'0 4px 12px rgba(0,0,0,0.08)',
            },
        }}
    >
        <Box sx={{ display:'flex', alignItems:'center', gap:0.875, mb:0.375 }}>
            <Box sx={{ 
                width:10, height:10, borderRadius:'50%', 
                bgcolor: dotColor || color, flexShrink:0,
                boxShadow: active ? `0 0 0 3px ${softColor}` : 'none',
                transition:'box-shadow 0.18s',
            }}/>
            <Typography sx={{ fontSize:'0.8125rem', fontWeight:600, color:C.text, fontFamily:FONT }}>{label}</Typography>
        </Box>
        {sublabel && (
            <Typography sx={{ fontSize:'0.6875rem', color:C.textMuted, fontFamily:FONT, ml:2.125, opacity:0.8 }}>{sublabel}</Typography>
        )}
    </Box>
);

/* ─────────────────────────── Section wrapper ───────────────────────── */
const Section = ({ label, children }) => (
    <Box sx={{ mb:3 }}>
        <Typography sx={{
            fontSize:'0.6875rem', fontWeight:700, color:C.textMuted,
            textTransform:'uppercase', letterSpacing:'0.08em',
            fontFamily:FONT, mb:1.25,
        }}>
            {label}
        </Typography>
        {children}
    </Box>
);

/* ─────────────────────────── Leave types ───────────────────────────── */
const LEAVE_TYPES = [
    { value:'Sick',    label:'Sick',    sublabel:'Medical leave',   color:'#FF9500', softColor:'#FFF8E7' },
    { value:'Casual',  label:'Casual',  sublabel:'Personal time',   color:'#007AFF', softColor:'#E8F4FD' },
    { value:'Planned', label:'Planned', sublabel:'Paid leave',      color:'#34C759', softColor:'#F0FDF4' },
];

const OVERRIDE_TYPES = [
    { value:'fullday',  label:'Full Day',  sublabel:'Mark present',    color:'#34C759',  softColor:'#F0FDF4' },
    { value:'halfday',  label:'Half Day',  sublabel:'Partial day',     color:'#FF9500',  softColor:'#FFF8E7' },
    { value:'holiday',  label:'Holiday',   sublabel:'Non-working day', color:'#007AFF',   softColor:'#E8F4FD'  },
    { value:'leave',    label:'Leave',     sublabel:'Mark as leave',   color:'#AF52DE', softColor:'#F5F0FF'},
];

/* ─────────────────────────── Main component ────────────────────────── */
const UniversalOverrideModal = ({ open, onClose, employees: employeesProp, onSuccess }) => {
    const [mode,      setMode]      = useState('override');
    const [allEmp,    setAllEmp]    = useState(true);
    const [selIds,    setSelIds]    = useState([]);
    const [startDate, setStart]     = useState('');
    const [endDate,   setEnd]       = useState('');
    const [useRange,  setUseRange]  = useState(false);
    const [note,      setNote]      = useState('');
    const [busy,      setBusy]      = useState(false);
    const [errMsg,    setErrMsg]    = useState('');
    const [confirm,   setConfirm]   = useState(false);
    const [employees, setEmployees] = useState([]);
    const [todayIST]                = useState(() => getISTDateString());
    const [calOpen,   setCalOpen]   = useState(false);
    const [selecting, setSelecting] = useState('start');
    const [ovType,    setOvType]    = useState('fullday');
    const [lvType,    setLvType]    = useState('Sick');
    const [maxDays,   setMaxDays]   = useState(3);
    const [result,    setResult]    = useState(null);

    const presets = useMemo(() => buildPresets(todayIST), [todayIST]);

    useEffect(() => {
        setEmployees(filterActiveEmployees(Array.isArray(employeesProp) ? employeesProp : []));
    }, [employeesProp]);

    useEffect(() => {
        if (!open) return;
        const t = getISTDateString();
        setMode('override'); setAllEmp(true); setSelIds([]);
        setUseRange(false); setStart(t); setEnd(t);
        setOvType('fullday'); setNote(''); setLvType('Sick'); setMaxDays(3);
        setErrMsg(''); setConfirm(false); setResult(null); setCalOpen(false);
    }, [open]);

    const effEnd  = useRange ? endDate : startDate;
    const dayCount = useMemo(() => {
        if (!startDate) return 0;
        const e = useRange && endDate ? (endDate <= todayIST ? endDate : todayIST) : startDate;
        if (startDate > e) return 0;
        return Math.round((new Date(e) - new Date(startDate)) / 86400000) + 1;
    }, [startDate, endDate, useRange, todayIST]);

    const MAX = 31;
    const isValid = (allEmp || selIds.length > 0)
        && !!startDate && startDate <= todayIST
        && (!useRange || (!!endDate && startDate <= endDate))
        && note.trim().length > 0
        && dayCount > 0 && dayCount <= MAX
        && (mode !== 'absentToLeave' || maxDays >= 1);

    const handlePreset = (p) => {
        const ce = p.end > todayIST ? todayIST : p.end;
        setStart(p.start); setEnd(ce);
        setUseRange(p.start !== ce); setCalOpen(false);
    };

    const close = () => { if (!busy) { setConfirm(false); onClose(); } };

    const submit = async () => {
        if (!isValid) return;
        const s = startDate.trim();
        const e = useRange ? (endDate||s).trim() : s;
        setBusy(true); setErrMsg('');
        try {
            let data;
            if (mode === 'override') {
                data = (await api.post('/admin/attendance/bulk-override', {
                    employeeScope: allEmp ? 'all' : selIds,
                    startDate: s, endDate: useRange ? e : undefined,
                    overrideType: ovType, overrideNote: note.trim(),
                })).data;
            } else {
                data = (await api.post('/admin/attendance/absent-to-leave', {
                    employeeScope: allEmp ? 'all' : selIds,
                    startDate: s, endDate: useRange ? e : undefined,
                    leaveType: lvType, maxDaysPerEmployee: maxDays, overrideNote: note.trim(),
                })).data;
            }
            setResult(data); setConfirm(false);
            if (onSuccess) await onSuccess(data);
        } catch (err) {
            setErrMsg(err?.response?.data?.error || 'Something went wrong. Please try again.');
            setConfirm(false);
        } finally {
            setBusy(false);
        }
    };

    if (!open) return null;

    /* ── Success screen ── */
    if (result) return (
        <Dialog open onClose={close} maxWidth="xs" fullWidth
            PaperProps={{ sx:{ 
                borderRadius:'20px', overflow:'hidden', fontFamily:FONT,
                boxShadow:'0 20px 60px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
            } }}>
            <Box sx={{ p:5, textAlign:'center' }}>
                <Box sx={{
                    width:72, height:72, borderRadius:'50%',
                    bgcolor:C.greenSoft, display:'flex', alignItems:'center',
                    justifyContent:'center', mx:'auto', mb:3,
                    boxShadow:'0 8px 24px rgba(52,199,89,0.2)',
                }}>
                    <CheckCircleOutline sx={{ fontSize:36, color:C.green }}/>
                </Box>
                <Typography sx={{ fontWeight:700, fontSize:'1.375rem', color:C.text, fontFamily:FONT, mb:1, letterSpacing:'-0.02em' }}>
                    {mode === 'absentToLeave' ? 'Absences Converted' : 'Override Applied'}
                </Typography>
                <Typography sx={{ color:C.textSub, fontSize:'0.9375rem', fontFamily:FONT, mb:0.75, lineHeight:1.5 }}>
                    {result.message}
                </Typography>
                {result.skippedCount > 0 && (
                    <Typography sx={{ color:C.amber, fontSize:'0.8125rem', fontFamily:FONT, mt:1, fontWeight:500 }}>
                        {result.skippedCount} skipped — insufficient balance or not permanent
                    </Typography>
                )}
                <Button fullWidth onClick={close} variant="contained"
                    sx={{ 
                        mt:4, 
                        background: `linear-gradient(135deg, ${C.red} 0%, ${C.redHover} 100%)`,
                        borderRadius:'12px', height:48, fontWeight:600,
                        fontFamily:FONT, fontSize:'0.9375rem', textTransform:'none',
                        boxShadow:'0 2px 8px rgba(229,57,53,0.25)',
                        transition:'all 0.15s',
                        '&:hover':{ 
                            background: `linear-gradient(135deg, ${C.redHover} 0%, #B71C1C 100%)`,
                            boxShadow:'0 4px 12px rgba(229,57,53,0.35)',
                            transform:'translateY(-1px)',
                        } 
                    }}>
                    Done
                </Button>
            </Box>
        </Dialog>
    );

    /* ── Mode label for confirm ── */
    const ovLabel = OVERRIDE_TYPES.find(t=>t.value===ovType)?.label || ovType;
    const lvLabel = LEAVE_TYPES.find(t=>t.value===lvType)?.label || lvType;

    return (
        <>
            {/* ══════════════ MAIN DIALOG ══════════════ */}
            <Dialog open={open && !confirm} onClose={close} maxWidth="sm" fullWidth
                PaperProps={{ sx:{
                    borderRadius:'20px', overflow:'hidden',
                    bgcolor:C.surface, fontFamily:FONT,
                    boxShadow:'0 20px 60px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
                    backdropFilter:'blur(12px)',
                } }}>

                {/* ── Header ── */}
                <Box sx={{ px:4, pt:3.5, pb:2.5 }}>
                    <Box sx={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', mb:2.5 }}>
                        <Box>
                            <Typography sx={{ fontWeight:700, fontSize:'1.375rem', color:C.text, fontFamily:FONT, letterSpacing:'-0.025em', lineHeight:1.2 }}>
                                Bulk Attendance Override
                            </Typography>
                            <Typography sx={{ color:C.textMuted, fontSize:'0.875rem', fontFamily:FONT, mt:0.5, opacity:0.8 }}>
                                Apply attendance actions across multiple employees
                            </Typography>
                        </Box>
                        <IconButton size="small" onClick={close}
                            sx={{ 
                                width:32, height:32, bgcolor:C.bg, color:C.textSub,
                                borderRadius:'50%',
                                transition:'all 0.15s',
                                '&:hover':{ 
                                    bgcolor:C.border, 
                                    transform:'scale(1.05)',
                                }, 
                                ml:2, mt:-0.25 
                            }}>
                            <CloseRounded sx={{ fontSize:17 }}/>
                        </IconButton>
                    </Box>

                    {/* Mode tabs */}
                    <Box sx={{ display:'flex', gap:0.5, bgcolor:C.bg, borderRadius:'14px', p:0.625, border:`1px solid ${C.border}` }}>
                        <PillTab
                            active={mode==='override'}
                            onClick={()=>setMode('override')}
                            icon={<SyncAltRounded sx={{ fontSize:17 }}/>}
                            label="Bulk Override"
                        />
                        <PillTab
                            active={mode==='absentToLeave'}
                            onClick={()=>setMode('absentToLeave')}
                            icon={<BeachAccessRounded sx={{ fontSize:17 }}/>}
                            label="Absent → Leave"
                        />
                    </Box>
                </Box>

                <Divider sx={{ borderColor:C.border, opacity:0.6 }}/>

                {/* ── Body ── */}
                <DialogContent sx={{ px:4, py:3, bgcolor:C.bg, '&::-webkit-scrollbar':{ width:6 }, '&::-webkit-scrollbar-thumb':{ bgcolor:C.border, borderRadius:3 } }}>

                    {errMsg && (
                        <Alert severity="error" icon={<ErrorOutlineRounded/>}
                            sx={{ 
                                mb:2.5, borderRadius:'12px', fontSize:'0.8125rem', fontFamily:FONT,
                                border:`1px solid #FFCDD2`,
                                bgcolor:'#FFEBEE',
                                '& .MuiAlert-message': { color:C.redText },
                            }}
                            onClose={()=>setErrMsg('')}>
                            {errMsg}
                        </Alert>
                    )}

                    {mode==='absentToLeave' && (
                        <Box sx={{ 
                            display:'flex', alignItems:'flex-start', gap:1.5, p:2,
                            bgcolor:C.blueSoft, border:`1px solid rgba(0,122,255,0.2)`, 
                            borderRadius:'14px', mb:2.5,
                            borderLeft:`4px solid ${C.blue}`,
                        }}>
                            <InfoOutlined sx={{ fontSize:18, color:C.blue, mt:0.15, flexShrink:0 }}/>
                            <Typography sx={{ fontSize:'0.8125rem', color:'#1D4ED8', fontFamily:FONT, lineHeight:1.6 }}>
                                Converts absent days to leave for employees with <strong>Permanent</strong> employment status only.
                                Leave balance is deducted automatically. Employees on Probation or Intern status are skipped.
                            </Typography>
                        </Box>
                    )}

                    {/* ── Employee scope ── */}
                    <Section label="Employee Scope">
                        <Paper elevation={0} sx={{ 
                            border:`1px solid ${C.border}`, 
                            borderRadius:'16px', 
                            overflow:'hidden', 
                            bgcolor:C.surface,
                            transition:'border-color 0.15s',
                            '&:hover': { borderColor:C.borderFocus },
                        }}>
                            <Box sx={{ px:2.5, py:2, cursor:'pointer' }}
                                onClick={()=>{ setAllEmp(!allEmp); if(!allEmp) setSelIds([]); }}>
                                <FormControlLabel sx={{ m:0, width:'100%', cursor:'pointer' }}
                                    control={
                                        <Checkbox checked={allEmp} size="small"
                                            onChange={e=>{ setAllEmp(e.target.checked); if(e.target.checked) setSelIds([]); }}
                                            sx={{ 
                                                color:C.border, p:0.75, mr:1, 
                                                '&.Mui-checked':{ color:C.red },
                                                '& .MuiSvgIcon-root': { fontSize:20 },
                                            }}
                                        />
                                    }
                                    label={
                                        <Box>
                                            <Typography sx={{ fontSize:'0.9375rem', fontWeight:600, color:C.text, fontFamily:FONT }}>
                                                {mode==='absentToLeave' ? 'All Permanent Employees' : 'All Active Employees'}
                                            </Typography>
                                            <Typography sx={{ fontSize:'0.8125rem', color:C.textMuted, fontFamily:FONT, mt:0.25, opacity:0.85 }}>
                                                {mode==='absentToLeave'
                                                    ? 'Only employees with Permanent employment status are eligible'
                                                    : 'Applies to all non-admin active employees'}
                                            </Typography>
                                        </Box>
                                    }
                                />
                            </Box>

                            {!allEmp && (
                                <>
                                    <Divider sx={{ borderColor:C.border, opacity:0.6 }}/>
                                    <Box sx={{ p:2.5 }}>
                                        <FormControl fullWidth size="small">
                                            <Select
                                                multiple
                                                displayEmpty
                                                value={selIds}
                                                onChange={e=>setSelIds(e.target.value)}
                                                renderValue={sel =>
                                                    sel.length === 0
                                                        ? <Typography sx={{ color:C.textMuted, fontSize:'0.875rem', fontFamily:FONT }}>Pick employees…</Typography>
                                                        : <Typography sx={{ fontSize:'0.875rem', fontFamily:FONT, color:C.text, fontWeight:500 }}>
                                                            {sel.length} employee{sel.length!==1?'s':''} selected
                                                          </Typography>
                                                }
                                                MenuProps={{
                                                    PaperProps:{
                                                        sx:{ 
                                                            borderRadius:'14px', mt:0.75, 
                                                            boxShadow:'0 12px 40px rgba(0,0,0,0.12)', 
                                                            border:`1px solid ${C.border}` 
                                                        }
                                                    }
                                                }}
                                                sx={{
                                                    borderRadius:'12px', bgcolor:C.surface,
                                                    fontFamily:FONT, fontSize:'0.875rem',
                                                    '& .MuiOutlinedInput-notchedOutline':{ borderColor:C.border },
                                                    '&:hover .MuiOutlinedInput-notchedOutline':{ borderColor:C.borderFocus },
                                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline':{ borderColor:C.red, borderWidth:2 },
                                                }}
                                            >
                                                {employees.map(emp => {
                                                    const isPerm = emp.employmentStatus === 'Permanent';
                                                    const dimmed = mode === 'absentToLeave' && !isPerm;
                                                    const stColor = isPerm ? C.green : emp.employmentStatus === 'Intern' ? C.amber : C.textMuted;
                                                    return (
                                                        <MenuItem key={emp._id} value={emp._id}
                                                            disabled={dimmed}
                                                            sx={{
                                                                px:1.5, py:1,
                                                                '&:hover':{ bgcolor: dimmed ? 'transparent' : C.bg },
                                                                '&.Mui-selected':{ bgcolor:C.redSoft },
                                                                '&.Mui-disabled':{ opacity:0.4 },
                                                            }}>
                                                            <Box sx={{ display:'flex', alignItems:'center', gap:1.25, width:'100%' }}>
                                                                <Checkbox checked={selIds.includes(emp._id)} size="small"
                                                                    sx={{ p:0, color:C.border, '&.Mui-checked':{ color:C.red } }}/>
                                                                <Avatar sx={{ width:28, height:28, fontSize:'0.7rem',
                                                                    bgcolor: dimmed ? C.bg : C.redSoft,
                                                                    color: dimmed ? C.textMuted : C.red,
                                                                    fontWeight:700, fontFamily:FONT }}>
                                                                    {(emp.fullName||emp.name||emp.email||'?').charAt(0).toUpperCase()}
                                                                </Avatar>
                                                                <Box sx={{ flex:1, minWidth:0 }}>
                                                                    <Typography sx={{ fontSize:'0.875rem', fontFamily:FONT, color:C.text, fontWeight:500 }}>
                                                                        {emp.fullName || emp.name || emp.email}
                                                                    </Typography>
                                                                    {emp.employmentStatus && (
                                                                        <Typography sx={{ fontSize:'0.7rem', fontFamily:FONT, color:stColor, fontWeight:600 }}>
                                                                            {emp.employmentStatus}
                                                                        </Typography>
                                                                    )}
                                                                </Box>
                                                                {mode === 'absentToLeave' && !isPerm && (
                                                                    <Typography sx={{ fontSize:'0.65rem', color:C.textMuted, fontStyle:'italic', ml:'auto' }}>
                                                                        Not eligible
                                                                    </Typography>
                                                                )}
                                                            </Box>
                                                        </MenuItem>
                                                    );
                                                })}
                                            </Select>
                                        </FormControl>

                                        {/* Selected chips */}
                                        {selIds.length > 0 && (
                                            <Box sx={{ display:'flex', flexWrap:'wrap', gap:0.75, mt:1.5 }}>
                                                {selIds.map(id => {
                                                    const emp = employees.find(e=>e._id===id);
                                                    return (
                                                        <Chip key={id} size="small"
                                                            label={emp?.fullName || emp?.name || emp?.email || id}
                                                            onDelete={()=>setSelIds(prev=>prev.filter(x=>x!==id))}
                                                            sx={{
                                                                bgcolor:C.redSoft, color:C.redText,
                                                                fontFamily:FONT, fontSize:'0.75rem', fontWeight:500,
                                                                border:`1px solid ${C.redBorder}`,
                                                                '& .MuiChip-deleteIcon':{ color:C.redText, '&:hover':{ color:C.redHover } }
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </Box>
                                        )}
                                    </Box>
                                </>
                            )}
                        </Paper>
                    </Section>

                    {/* ── Date Selection ── */}
                    <Section label="Date Selection">
                        {/* Selected Date Display Card */}
                        <Box onClick={()=>setCalOpen(v=>!v)}
                            sx={{
                                display:'flex', alignItems:'center', justifyContent:'space-between',
                                px:3, py:2,
                                border:`1px solid ${calOpen ? C.red : C.border}`,
                                borderRadius:'16px', 
                                cursor:'pointer', 
                                bgcolor: calOpen ? 'rgba(229,57,53,0.03)' : C.surface,
                                transition:'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                                boxShadow: calOpen ? '0 0 0 3px rgba(229,57,53,0.08)' : 'none',
                                '&:hover':{ 
                                    borderColor: C.red,
                                    bgcolor:'rgba(229,57,53,0.03)',
                                    boxShadow:'0 2px 12px rgba(0,0,0,0.08)',
                                },
                            }}
                        >
                            <Box sx={{ display:'flex', alignItems:'center', gap:1.5 }}>
                                <Box sx={{ 
                                    width:40, height:40, 
                                    borderRadius:'12px',
                                    bgcolor: calOpen ? C.redSoft : C.bg,
                                    display:'flex', alignItems:'center', justifyContent:'center',
                                    transition:'all 0.15s',
                                }}>
                                    <CalendarToday sx={{ fontSize:20, color: calOpen ? C.red : C.textMuted, transition:'color 0.15s' }}/>
                                </Box>
                                <Box>
                                    <Typography sx={{ fontSize:'0.6875rem', fontWeight:600, color:C.textMuted, fontFamily:FONT, textTransform:'uppercase', letterSpacing:'0.05em', mb:0.25 }}>
                                        {useRange ? 'Date Range' : 'Selected Date'}
                                    </Typography>
                                    <Typography sx={{ fontSize:'0.9375rem', fontWeight:600, color:C.text, fontFamily:FONT, letterSpacing:'-0.01em' }}>
                                        {fmtDisplay(startDate, useRange ? effEnd : null)}
                                    </Typography>
                                </Box>
                            </Box>
                            {dayCount > 0 && (
                                <Box sx={{ 
                                    px:1.5, py:0.5, 
                                    borderRadius:'8px',
                                    bgcolor: dayCount>MAX ? '#FEE2E2' : C.redSoft,
                                    border:`1px solid ${dayCount>MAX ? '#FCA5A5' : C.redBorder}`,
                                }}>
                                    <Typography sx={{ 
                                        fontSize:'0.8125rem', fontWeight:700, fontFamily:FONT,
                                        color: dayCount>MAX ? '#DC2626' : C.redText,
                                    }}>
                                        {dayCount}d
                                    </Typography>
                                </Box>
                            )}
                        </Box>
                        {dayCount > MAX && (
                            <Box sx={{ display:'flex', alignItems:'center', gap:1, mt:1.25, px:1 }}>
                                <ErrorOutlineRounded sx={{ fontSize:16, color:C.red }}/>
                                <Typography sx={{ fontSize:'0.8125rem', color:C.red, fontFamily:FONT, fontWeight:500 }}>
                                    Maximum {MAX} days per operation
                                </Typography>
                            </Box>
                        )}

                        {/* Premium Calendar Container */}
                        {calOpen && (
                            <Box sx={{
                                mt:2, p:3, 
                                borderRadius:'20px',
                                bgcolor:'#FAFAFA', 
                                boxShadow:'inset 0 2px 8px rgba(0,0,0,0.04)',
                                border:`1px solid ${C.border}`,
                                animation:'fadeSlideIn 0.15s ease-out',
                                '@keyframes fadeSlideIn': {
                                    from: { opacity:0, transform:'translateY(-8px)' },
                                    to: { opacity:1, transform:'translateY(0)' },
                                },
                            }}>
                                {/* Range toggle + selectors */}
                                <Box sx={{ display:'flex', alignItems:'center', gap:1.5, mb:2.5, flexWrap:'wrap' }}>
                                    <FormControlLabel sx={{ m:0 }}
                                        control={
                                            <Checkbox checked={useRange} size="small"
                                                onChange={e=>{ setUseRange(e.target.checked); if(!e.target.checked) setEnd(startDate); }}
                                                sx={{ 
                                                    p:0.5, color:C.border, 
                                                    '&.Mui-checked':{ color:C.red },
                                                    '& .MuiSvgIcon-root': { fontSize:20 },
                                                }}
                                            />
                                        }
                                        label={<Typography sx={{ fontSize:'0.8125rem', fontWeight:600, color:C.textSub, fontFamily:FONT }}>Date range</Typography>}
                                    />
                                    {useRange && (
                                        <Box sx={{ display:'flex', gap:1, ml:'auto' }}>
                                            {[{k:'start',lbl:'From',val:startDate},{k:'end',lbl:'To',val:endDate}].map(s=>(
                                                <Box key={s.k} onClick={()=>setSelecting(s.k)}
                                                    sx={{
                                                        px:2, py:1, borderRadius:'12px', cursor:'pointer',
                                                        border:`1.5px solid ${selecting===s.k ? C.red : C.border}`,
                                                        bgcolor: selecting===s.k ? C.surface : C.surface,
                                                        transition:'all 0.15s',
                                                        boxShadow: selecting===s.k ? '0 2px 8px rgba(229,57,53,0.15)' : 'none',
                                                        '&:hover':{ borderColor:C.red, boxShadow:'0 2px 8px rgba(229,57,53,0.15)' },
                                                    }}
                                                >
                                                    <Typography sx={{ fontSize:'0.6875rem', fontWeight:700, color:C.textMuted, fontFamily:FONT, textTransform:'uppercase', letterSpacing:'0.05em' }}>{s.lbl}</Typography>
                                                    <Typography sx={{ fontSize:'0.8125rem', fontWeight:600, color:C.text, fontFamily:FONT, mt:0.375 }}>
                                                        {s.val ? new Date(s.val+'T00:00:00').toLocaleDateString('en-IN', {month:'short',day:'numeric'}) : '—'}
                                                    </Typography>
                                                </Box>
                                            ))}
                                        </Box>
                                    )}
                                </Box>

                                {/* Calendar */}
                                <Box sx={{ 
                                    bgcolor:C.surface, 
                                    borderRadius:'16px', 
                                    p:2.5,
                                    boxShadow:'0 1px 3px rgba(0,0,0,0.06)',
                                }}>
                                    <MiniCalendar
                                        startDate={startDate} endDate={useRange?endDate:null}
                                        onStartChange={d=>{ setStart(d); if(!useRange)setEnd(d); if(useRange)setSelecting('end'); }}
                                        onEndChange={d=>{ setEnd(d); setSelecting('start'); }}
                                        todayIST={todayIST} selecting={selecting} useRange={useRange}
                                    />
                                </Box>

                                {/* Confirm Button */}
                                <Button fullWidth onClick={()=>setCalOpen(false)}
                                    sx={{
                                        mt:2.5, height:48, borderRadius:'14px',
                                        background: `linear-gradient(135deg, ${C.red} 0%, ${C.redHover} 100%)`,
                                        color:'#fff', textTransform:'none',
                                        fontSize:'0.9375rem', fontWeight:600, fontFamily:FONT,
                                        boxShadow:'0 6px 20px rgba(229,57,53,0.25)',
                                        transition:'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
                                        '&:hover':{ 
                                            background: `linear-gradient(135deg, ${C.redHover} 0%, #B71C1C 100%)`,
                                            boxShadow:'0 8px 24px rgba(229,57,53,0.35)',
                                            transform:'translateY(-2px)',
                                        },
                                        '&:active':{ 
                                            transform:'translateY(0)',
                                        },
                                    }}>
                                    Confirm Dates
                                </Button>
                            </Box>
                        )}
                    </Section>

                    {/* ── Override type (override mode) ── */}
                    {mode==='override' && (
                        <Section label="Override Type">
                            <Box sx={{ display:'flex', gap:1.25, flexWrap:'wrap' }}>
                                {OVERRIDE_TYPES.map(t=>(
                                    <TypeTile key={t.value} {...t} active={ovType===t.value} onClick={()=>setOvType(t.value)}/>
                                ))}
                            </Box>
                        </Section>
                    )}

                    {/* ── Leave config (absent→leave mode) ── */}
                    {mode==='absentToLeave' && (
                        <Section label="Leave Configuration">
                            <Paper elevation={0} sx={{ border:`1px solid ${C.border}`, borderRadius:'16px', overflow:'hidden', bgcolor:C.surface }}>
                                <Box sx={{ px:2.5, pt:2.5, pb:2 }}>
                                    <Typography sx={{ fontSize:'0.8125rem', fontWeight:600, color:C.textSub, fontFamily:FONT, mb:1.5 }}>
                                        Leave type to assign
                                    </Typography>
                                    <Box sx={{ display:'flex', gap:1.25 }}>
                                        {LEAVE_TYPES.map(t=>(
                                            <TypeTile key={t.value} {...t} active={lvType===t.value} onClick={()=>setLvType(t.value)}/>
                                        ))}
                                    </Box>
                                </Box>
                                <Divider sx={{ borderColor:C.border, opacity:0.6 }}/>
                                <Box sx={{ px:2.5, py:2.25 }}>
                                    <Typography sx={{ fontSize:'0.8125rem', fontWeight:600, color:C.textSub, fontFamily:FONT, mb:1.5 }}>
                                        Max absent days to convert per employee
                                    </Typography>
                                    <Box sx={{ display:'flex', gap:1.25, alignItems:'center' }}>
                                        {[1,2,3].map(n=>(
                                            <Box key={n} onClick={()=>setMaxDays(n)}
                                                sx={{
                                                    width:48, height:48,
                                                    border:`2px solid ${maxDays===n ? C.red : C.border}`,
                                                    borderRadius:'12px', cursor:'pointer',
                                                    display:'flex', alignItems:'center', justifyContent:'center',
                                                    bgcolor: maxDays===n ? C.redSoft : C.surface,
                                                    fontWeight:700, fontSize:'1.125rem', fontFamily:FONT,
                                                    color: maxDays===n ? C.red : C.textSub,
                                                    transition:'all 0.18s cubic-bezier(0.4, 0, 0.2, 1)',
                                                    transform: maxDays===n ? 'scale(1.05)' : 'scale(1)',
                                                    boxShadow: maxDays===n ? '0 4px 12px rgba(0,0,0,0.08)' : 'none',
                                                    '&:hover':{ 
                                                        borderColor:C.red, 
                                                        bgcolor:C.redSoft, 
                                                        color:C.red,
                                                        transform:'scale(1.05)',
                                                        boxShadow:'0 4px 12px rgba(0,0,0,0.08)',
                                                    },
                                                }}
                                            >{n}</Box>
                                        ))}
                                        <Typography sx={{ fontSize:'0.75rem', color:C.textMuted, fontFamily:FONT, ml:0.75, opacity:0.85 }}>
                                            Only actual absent days are counted
                                        </Typography>
                                    </Box>
                                </Box>
                            </Paper>
                        </Section>
                    )}

                    {/* ── Reason ── */}
                    <Section label="Reason *">
                        <TextField fullWidth multiline rows={3} size="small"
                            placeholder={mode==='absentToLeave'
                                ? 'e.g. Converting January absences to sick leave per HR policy'
                                : 'e.g. Company declared holiday, Emergency closure, Special event'}
                            value={note}
                            onChange={e=>setNote(e.target.value)}
                            helperText={
                                <Typography component="span" sx={{ fontSize:'0.75rem', fontFamily:FONT,
                                    color: note.trim() ? C.textMuted : C.red, fontWeight:500 }}>
                                    {note.trim() ? `${note.length} characters` : 'Required for audit trail'}
                                </Typography>
                            }
                            sx={{
                                '& .MuiOutlinedInput-root':{
                                    borderRadius:'14px', bgcolor:'#FAFAFA', fontFamily:FONT, fontSize:'0.875rem',
                                    padding:'12px 14px',
                                    transition:'all 0.15s',
                                    '& fieldset':{ borderColor:C.border },
                                    '&:hover fieldset':{ borderColor:C.borderFocus, bgcolor:C.surface },
                                    '&.Mui-focused':{
                                        bgcolor:C.surface,
                                        '& fieldset':{ borderColor:C.red, borderWidth:2 },
                                    },
                                },
                                '& .MuiInputBase-input':{
                                    padding:0,
                                    lineHeight:1.6,
                                },
                                '& .MuiInputBase-input::placeholder':{ color:C.textMuted, opacity:0.7 },
                            }}
                        />
                    </Section>
                </DialogContent>

                {/* ── Footer ── */}
                <Box sx={{
                    px:4, py:2.5, bgcolor:C.surface,
                    borderTop:`1px solid ${C.border}`,
                    display:'flex', gap:1.5, justifyContent:'flex-end',
                }}>
                    <Button onClick={close} disabled={busy}
                        sx={{
                            height:44, px:3, borderRadius:'12px',
                            color:C.textSub, fontFamily:FONT, fontWeight:500,
                            fontSize:'0.875rem', textTransform:'none',
                            border:`1px solid ${C.border}`,
                            transition:'all 0.15s',
                            '&:hover':{ bgcolor:C.bg, borderColor:C.borderFocus },
                        }}>
                        Cancel
                    </Button>
                    <Button onClick={()=>{ if(isValid){ setErrMsg(''); setConfirm(true); } }}
                        disabled={!isValid || busy} variant="contained"
                        sx={{
                            height:44, px:3.5, borderRadius:'12px',
                            background: `linear-gradient(135deg, ${C.red} 0%, ${C.redHover} 100%)`,
                            fontFamily:FONT, fontWeight:600,
                            fontSize:'0.875rem', textTransform:'none',
                            boxShadow:'0 2px 8px rgba(229,57,53,0.25)',
                            transition:'all 0.15s',
                            '&:hover':{ 
                                background: `linear-gradient(135deg, ${C.redHover} 0%, #B71C1C 100%)`,
                                boxShadow:'0 4px 12px rgba(229,57,53,0.35)',
                                transform:'translateY(-1px)',
                            },
                            '&.Mui-disabled':{ 
                                background:C.border, 
                                color:C.textMuted,
                                boxShadow:'none',
                            },
                        }}>
                        {mode==='absentToLeave' ? 'Convert Absences' : 'Apply Override'}
                    </Button>
                </Box>
            </Dialog>

            {/* ══════════════ CONFIRM DIALOG ══════════════ */}
            <Dialog open={confirm} onClose={()=>!busy&&setConfirm(false)} maxWidth="xs" fullWidth
                PaperProps={{ sx:{ 
                    borderRadius:'20px', fontFamily:FONT, 
                    boxShadow:'0 20px 60px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)' 
                } }}>
                <Box sx={{ px:4, pt:3.5, pb:2.5 }}>
                    <Box sx={{ display:'flex', alignItems:'center', justifyContent:'space-between', mb:0.75 }}>
                        <Typography sx={{ fontWeight:700, fontSize:'1.25rem', color:C.text, fontFamily:FONT, letterSpacing:'-0.02em' }}>
                            Confirm Override
                        </Typography>
                        <IconButton size="small" onClick={()=>setConfirm(false)}
                            sx={{ 
                                width:32, height:32, bgcolor:C.bg, color:C.textSub, borderRadius:'50%',
                                transition:'all 0.15s',
                                '&:hover':{ bgcolor:C.border, transform:'scale(1.05)' },
                            }}>
                            <CloseRounded sx={{ fontSize:16 }}/>
                        </IconButton>
                    </Box>
                    <Typography sx={{ fontSize:'0.875rem', color:C.textMuted, fontFamily:FONT, opacity:0.85 }}>
                        Review before applying — this modifies attendance records.
                    </Typography>
                </Box>

                <Divider sx={{ borderColor:C.border, opacity:0.6 }}/>

                <DialogContent sx={{ px:4, py:3 }}>
                    {/* Summary rows */}
                    {[
                        { label:'Scope',      val: allEmp ? 'All employees' : `${selIds.length} selected` },
                        { label:'Date range', val: `${fmtDisplay(startDate, useRange ? effEnd : null)} (${dayCount}d)` },
                        { label:'Action',     val: mode==='absentToLeave' ? `Absent → ${lvLabel} Leave` : ovLabel },
                        ...(mode==='absentToLeave' ? [{ label:'Max days/employee', val: `${maxDays}` }] : []),
                    ].map(row=>(
                        <Box key={row.label} sx={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', py:0.875,
                            borderBottom:`1px solid ${C.border}`, '&:last-of-type':{ borderBottom:'none' } }}>
                            <Typography sx={{ fontSize:'0.8rem', color:C.textMuted, fontFamily:FONT }}>{row.label}</Typography>
                            <Typography sx={{ fontSize:'0.8rem', fontWeight:600, color:C.text, fontFamily:FONT, maxWidth:'55%', textAlign:'right' }}>
                                {row.val}
                            </Typography>
                        </Box>
                    ))}

                    <Box sx={{ mt:1.5, px:1.5, py:1.25, bgcolor:C.bg, borderRadius:'10px' }}>
                        <Typography sx={{ fontSize:'0.72rem', color:C.textMuted, fontFamily:FONT, mb:0.25 }}>Reason</Typography>
                        <Typography sx={{ fontSize:'0.8125rem', fontWeight:500, color:C.text, fontFamily:FONT }}>{note}</Typography>
                    </Box>

                    {busy && <LinearProgress color="error" sx={{ mt:2, borderRadius:1 }}/>}
                </DialogContent>

                <Box sx={{ px:4, pb:3.5, display:'flex', gap:1.5, justifyContent:'flex-end' }}>
                    <Button onClick={()=>setConfirm(false)} disabled={busy}
                        sx={{ 
                            height:44, px:3, borderRadius:'12px', color:C.textSub,
                            fontFamily:FONT, fontWeight:500, fontSize:'0.875rem', textTransform:'none',
                            border:`1px solid ${C.border}`, 
                            transition:'all 0.15s',
                            '&:hover':{ bgcolor:C.bg, borderColor:C.borderFocus } 
                        }}>
                        Back
                    </Button>
                    <Button onClick={submit} disabled={busy} variant="contained"
                        sx={{ 
                            height:44, px:3.5, borderRadius:'12px',
                            background: `linear-gradient(135deg, ${C.red} 0%, ${C.redHover} 100%)`,
                            fontFamily:FONT, fontWeight:600, fontSize:'0.875rem', textTransform:'none',
                            boxShadow:'0 2px 8px rgba(229,57,53,0.25)',
                            transition:'all 0.15s',
                            '&:hover':{ 
                                background: `linear-gradient(135deg, ${C.redHover} 0%, #B71C1C 100%)`,
                                boxShadow:'0 4px 12px rgba(229,57,53,0.35)',
                                transform:'translateY(-1px)',
                            } 
                        }}>
                        {busy ? 'Applying…' : 'Confirm & Apply'}
                    </Button>
                </Box>
            </Dialog>
        </>
    );
};

export default UniversalOverrideModal;
