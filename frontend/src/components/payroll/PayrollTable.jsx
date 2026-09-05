// frontend/src/components/payroll/PayrollTable.jsx

import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  TextField,
  InputAdornment,
  Menu,
  MenuItem,
  Divider,
  Alert,
  TablePagination
} from '@mui/material';
import {
  Add,
  Edit,
  Delete,
  Search,
  FilterList,
  Download,
  MoreVert,
  CheckCircle,
  Cancel,
  Visibility
} from '@mui/icons-material';
import PayrollDialog from './PayrollDialog';
import EmployeeSalaryDetail from './EmployeeSalaryDetail';
import axios from '../../api/axios';

const PayrollTable = ({ employees, onEmployeesUpdate, settings }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAnchor, setFilterAnchor] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [allEmployees, setAllEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [salaryDetailOpen, setSalaryDetailOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  // Fetch employees from API
  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/admin/employees?all=true');
      const employeesData = response.data.map(emp => {
        // Check if employee already has payroll data in sessionStorage
        const existingPayroll = employees.find(e => e.id === emp._id);
        
        if (existingPayroll) {
          return existingPayroll;
        }
        
        // Calculate salary for new employees
        const ctc = 600000; // Default CTC
        const basic = (ctc * settings.basicPercentage) / 100;
        const hra = (ctc * settings.hraPercentage) / 100;
        const allowances = (ctc * settings.allowancesPercentage) / 100;
        const grossPay = basic + hra + allowances;
        
        const pf = (basic * settings.pfPercentage) / 100;
        const esi = (grossPay * settings.esiPercentage) / 100;
        const tds = (grossPay * settings.tdsPercentage) / 100;
        const totalDeductions = pf + esi + settings.professionalTax + tds;
        const netPay = grossPay - totalDeductions;
        
        return {
          id: emp._id,
          name: emp.fullName,
          email: emp.email,
          department: emp.department || 'General',
          designation: emp.designation || 'Employee',
          ctc: ctc,
          basic: basic,
          hra: hra,
          allowances: allowances,
          grossPay: grossPay,
          deductions: totalDeductions,
          netPay: netPay,
          status: 'pending',
          overtimeHours: 0,
          unpaidLeaveDays: 0,
          bonus: 0
        };
      });
      
      setAllEmployees(employeesData);
      if (employees.length === 0) {
        onEmployeesUpdate(employeesData);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error fetching employees:', error);
      setLoading(false);
    }
  };

  // Get unique departments
  const departments = ['all', ...new Set(allEmployees.map(emp => emp.department))];

  // Filter employees
  const filteredEmployees = allEmployees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         emp.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDepartment = selectedDepartment === 'all' || emp.department === selectedDepartment;
    return matchesSearch && matchesDepartment;
  });

  const handleAddEmployee = () => {
    setEditingEmployee(null);
    setDialogOpen(true);
  };

  const handleEditEmployee = (employee) => {
    setEditingEmployee(employee);
    setDialogOpen(true);
  };

  const handleDeleteEmployee = (employee) => {
    const updatedEmployees = allEmployees.filter(emp => emp.id !== employee.id);
    setAllEmployees(updatedEmployees);
    onEmployeesUpdate(updatedEmployees);
    setDeleteConfirm(null);
  };

  const handleViewSalaryDetail = (employee) => {
    setSelectedEmployee(employee);
    setSalaryDetailOpen(true);
  };

  const handleSaveEmployee = (employeeData) => {
    if (editingEmployee) {
      // Update existing employee
      const updatedEmployees = allEmployees.map(emp =>
        emp.id === editingEmployee.id ? { ...emp, ...employeeData } : emp
      );
      setAllEmployees(updatedEmployees);
      onEmployeesUpdate(updatedEmployees);
    } else {
      // Add new employee
      const newEmployee = {
        ...employeeData,
        id: `emp_${Date.now()}`,
        status: 'pending'
      };
      const updatedEmployees = [...allEmployees, newEmployee];
      setAllEmployees(updatedEmployees);
      onEmployeesUpdate(updatedEmployees);
    }
    setDialogOpen(false);
  };

  const handleApprovePayroll = (employeeId) => {
    const updatedEmployees = allEmployees.map(emp =>
      emp.id === employeeId ? { ...emp, status: 'approved' } : emp
    );
    setAllEmployees(updatedEmployees);
    onEmployeesUpdate(updatedEmployees);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const paginatedEmployees = filteredEmployees.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Box>
      <Box className="card">
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Box>
            <Typography className="card-title">
              Employee Salary Management
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--text-secondary)' }}>
              Manage and configure employee salaries and payroll
            </Typography>
          </Box>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={handleAddEmployee}
            className="btn-primary"
          >
            Add Employee Salary
          </Button>
        </Box>

        <Divider sx={{ mb: 3, borderColor: 'var(--border-color)' }} />

        {/* Search and Filter */}
        <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
          <TextField
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            variant="outlined"
            size="small"
            sx={{ flexGrow: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />
          <Button
            variant="outlined"
            startIcon={<FilterList />}
            onClick={(e) => setFilterAnchor(e.currentTarget)}
            className="btn-secondary"
          >
            Filter
          </Button>
          <Menu
            anchorEl={filterAnchor}
            open={Boolean(filterAnchor)}
            onClose={() => setFilterAnchor(null)}
          >
            {departments.map(dept => (
              <MenuItem
                key={dept}
                selected={selectedDepartment === dept}
                onClick={() => {
                  setSelectedDepartment(dept);
                  setFilterAnchor(null);
                }}
              >
                {dept === 'all' ? 'All Departments' : dept}
              </MenuItem>
            ))}
          </Menu>
        </Box>

        {/* Table */}
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#f8f9fa' }}>
                <TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Department</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Designation</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">CTC (Annual)</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Gross Pay</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Deductions</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">Net Pay</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="center">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginatedEmployees.length > 0 ? (
                paginatedEmployees.map((employee) => (
                  <TableRow
                    key={employee.id}
                    sx={{
                      '&:hover': { backgroundColor: '#f8f9fa' },
                      transition: 'background-color 0.2s'
                    }}
                  >
                    <TableCell>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {employee.name}
                        </Typography>
                        <Typography variant="caption" sx={{ color: '#6c757d' }}>
                          {employee.email}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>{employee.department}</TableCell>
                    <TableCell>{employee.designation}</TableCell>
                    <TableCell align="right">
                      ₹{employee.ctc.toLocaleString('en-IN')}
                    </TableCell>
                    <TableCell align="right">
                      ₹{employee.grossPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell align="right">
                      ₹{employee.deductions.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      ₹{employee.netPay.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={employee.status}
                        size="small"
                        color={employee.status === 'approved' ? 'success' : 'warning'}
                        icon={employee.status === 'approved' ? <CheckCircle /> : <Cancel />}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton
                        size="small"
                        onClick={() => handleViewSalaryDetail(employee)}
                        sx={{ color: '#e53935' }}
                        title="View Salary Details"
                      >
                        <Visibility fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => handleEditEmployee(employee)}
                        sx={{ color: '#1a237e' }}
                      >
                        <Edit fontSize="small" />
                      </IconButton>
                      {employee.status === 'pending' && (
                        <IconButton
                          size="small"
                          onClick={() => handleApprovePayroll(employee.id)}
                          sx={{ color: '#28a745' }}
                        >
                          <CheckCircle fontSize="small" />
                        </IconButton>
                      )}
                      <IconButton
                        size="small"
                        onClick={() => setDeleteConfirm(employee)}
                        sx={{ color: '#dc3545' }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      {loading ? 'Loading employees...' : 'No employees found'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Pagination */}
        <TablePagination
          component="div"
          count={filteredEmployees.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
            rowsPerPageOptions={[5, 10, 25, 50]}
          />
        </Box>

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <Alert
          severity="warning"
          action={
            <Box>
              <Button size="small" onClick={() => handleDeleteEmployee(deleteConfirm)}>
                Confirm
              </Button>
              <Button size="small" onClick={() => setDeleteConfirm(null)}>
                Cancel
              </Button>
            </Box>
          }
          sx={{ mb: 2 }}
        >
          Are you sure you want to delete salary record for {deleteConfirm.name}?
        </Alert>
      )}

      {/* Payroll Dialog */}
      <PayrollDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSaveEmployee}
        employee={editingEmployee}
        settings={settings}
      />

      {/* Employee Salary Detail Dialog */}
      <EmployeeSalaryDetail
        open={salaryDetailOpen}
        onClose={() => setSalaryDetailOpen(false)}
        employee={selectedEmployee}
        settings={settings}
      />
    </Box>
  );
};

export default PayrollTable;

