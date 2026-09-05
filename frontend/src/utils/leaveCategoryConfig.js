import BeachAccessIcon from '@mui/icons-material/BeachAccess';
import WorkspacePremiumIcon from '@mui/icons-material/WorkspacePremium';
import LocalHospitalIcon from '@mui/icons-material/LocalHospital';
import UpdateIcon from '@mui/icons-material/Update';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import HistoryIcon from '@mui/icons-material/History';

export const LEAVE_CATEGORY_CONFIG = {
    Casual: { label: 'Casual Leave', description: 'Short personal time off', Icon: BeachAccessIcon },
    Planned: { label: 'Earned Leave', description: 'Accrued paid leave', Icon: WorkspacePremiumIcon },
    Sick: { label: 'Sick Leave', description: 'Health-related absence', Icon: LocalHospitalIcon },
    Compensatory: { label: 'Compensatory Off', description: 'Against worked weekend/holiday', Icon: UpdateIcon },
    'Loss of Pay': { label: 'Loss of Pay (LOP)', description: 'Unpaid leave', Icon: WarningAmberIcon },
    'Backdated Leave': { label: 'Backdated Leave', description: 'Applied for past dates', Icon: HistoryIcon },
};

export const STANDARD_LEAVES = ['Casual', 'Planned', 'Sick', 'Compensatory'];
export const SPECIAL_CASES = ['Loss of Pay', 'Backdated Leave'];
export const LEAVE_CATEGORY_PLACEHOLDER = 'Select leave type';
