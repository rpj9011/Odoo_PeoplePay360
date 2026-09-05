import EventAvailableIcon from '@mui/icons-material/EventAvailable';
import WbSunnyOutlinedIcon from '@mui/icons-material/WbSunnyOutlined';
import WbTwilightIcon from '@mui/icons-material/WbTwilight';

export const DAY_TYPE_OPTIONS = [
    {
        value: 'Full Day',
        label: 'Full Day',
        description: 'Leave for the entire working day',
        Icon: EventAvailableIcon,
    },
    {
        value: 'Half Day - First Half',
        label: 'Half Day — First Half',
        description: 'Morning session only (before lunch)',
        Icon: WbSunnyOutlinedIcon,
    },
    {
        value: 'Half Day - Second Half',
        label: 'Half Day — Second Half',
        description: 'Afternoon session only (after lunch)',
        Icon: WbTwilightIcon,
    },
];

export const getDayTypeConfig = (value) =>
    DAY_TYPE_OPTIONS.find((opt) => opt.value === value) || null;
