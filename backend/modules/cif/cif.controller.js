const CIF = require('./cif.model');
const CIFAudit = require('./cifAudit.model');
const {
  generateCIFId,
  validateStatusTransition,
  createAuditLog,
  canEditCIF,
  canDeleteCIF,
  calculateRiskLevel
} = require('./cif.service');

// Get paginated CIF list with advanced filtering (Phase 3 Enhanced)
exports.getCIFList = async (req, res) => {
  try {
    const startTime = Date.now(); // Performance tracking
    
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Base filter - exclude archived by default
    const filter = { 
      isArchived: req.query.includeArchived === 'true' ? { $in: [true, false] } : false 
    };

    // Phase 3: Advanced filtering
    // Multi-select filters using $in
    if (req.query.department) {
      const departments = Array.isArray(req.query.department) 
        ? req.query.department 
        : req.query.department.split(',');
      filter.department = { $in: departments };
    }

    if (req.query.severity) {
      const severities = Array.isArray(req.query.severity) 
        ? req.query.severity 
        : req.query.severity.split(',');
      filter.severity = { $in: severities };
    }

    if (req.query.status) {
      const statuses = Array.isArray(req.query.status) 
        ? req.query.status 
        : req.query.status.split(',');
      filter.status = { $in: statuses };
    }

    if (req.query.category) {
      const categories = Array.isArray(req.query.category) 
        ? req.query.category 
        : req.query.category.split(',');
      filter.category = { $in: categories };
    }

    if (req.query.confidentialLevel) {
      const levels = Array.isArray(req.query.confidentialLevel) 
        ? req.query.confidentialLevel 
        : req.query.confidentialLevel.split(',');
      filter.confidentialLevel = { $in: levels };
    }

    // Single value filters
    if (req.query.assignedTo) {
      filter.assignedTo = req.query.assignedTo;
    }

    if (req.query.employeeId) {
      filter.employeeId = req.query.employeeId;
    }

    // Date range filtering
    if (req.query.dateFrom || req.query.dateTo) {
      filter.incidentDate = {};
      if (req.query.dateFrom) {
        filter.incidentDate.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        filter.incidentDate.$lte = new Date(req.query.dateTo);
      }
    }

    // Search by title or employee name (requires aggregation for employee name)
    if (req.query.search) {
      const searchRegex = { $regex: req.query.search, $options: 'i' };
      
      // If searching, we need to use aggregation to search employee names
      const User = require('../../models/User');
      const matchingUsers = await User.find({
        $or: [
          { fullName: searchRegex },
          { employeeCode: searchRegex }
        ]
      }).select('_id').lean();
      
      const userIds = matchingUsers.map(u => u._id);
      
      filter.$or = [
        { title: searchRegex },
        { employeeId: { $in: userIds } }
      ];
    }

    const [records, total] = await Promise.all([
      CIF.find(filter)
        .select('-description') // Exclude description for list view performance
        .populate('employeeId', 'fullName email employeeCode department')
        .populate('assignedTo', 'fullName email')
        .populate('createdBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(), // Phase 3: Use lean() for better performance
      CIF.countDocuments(filter)
    ]);

    const responseTime = Date.now() - startTime;
    // Only log slow queries (>500ms) in production
    if (process.env.NODE_ENV !== 'production' || responseTime > 500) {
      console.log(`CIF List query completed in ${responseTime}ms`);
    }

    res.json({
      records,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching CIF list:', error);
    res.status(500).json({ error: 'Failed to fetch CIF records' });
  }
};

// Get single CIF
exports.getCIFById = async (req, res) => {
  try {
    const cif = await CIF.findOne({ _id: req.params.id, isArchived: false })
      .populate('employeeId', 'fullName email employeeCode department')
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email')
      .lean();

    if (!cif) {
      return res.status(404).json({ error: 'CIF record not found' });
    }

    // Log view action
    await createAuditLog(cif._id, 'view', req.user._id);

    res.json(cif);
  } catch (error) {
    console.error('Error fetching CIF:', error);
    res.status(500).json({ error: 'Failed to fetch CIF record' });
  }
};

// Create CIF
exports.createCIF = async (req, res) => {
  try {
    const {
      employeeId,
      title,
      category,
      severity,
      description,
      incidentDate,
      status,
      assignedTo,
      followUpDate,
      confidentialLevel
    } = req.body;

    // Validation
    if (!employeeId || !title || !category || !severity || !description || !incidentDate) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate incident date is not in future
    if (new Date(incidentDate) > new Date()) {
      return res.status(400).json({ error: 'Incident date cannot be in the future' });
    }

    // Generate CIF ID
    const { cifNumber, cifId } = await generateCIFId();

    const cif = new CIF({
      cifNumber,
      cifId,
      employeeId,
      title,
      category,
      severity,
      description,
      incidentDate,
      status: status || 'open',
      assignedTo,
      followUpDate,
      confidentialLevel: confidentialLevel || 'internal',
      createdBy: req.user._id
    });

    await cif.save();

    // Create audit log
    await createAuditLog(cif._id, 'create', req.user._id, null, {
      cifId,
      title,
      category,
      severity,
      status: cif.status
    });

    const populated = await CIF.findById(cif._id)
      .populate('employeeId', 'fullName email employeeCode')
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email')
      .lean();

    res.status(201).json(populated);
  } catch (error) {
    console.error('Error creating CIF:', error);
    res.status(500).json({ error: 'Failed to create CIF record' });
  }
};

// Update CIF
exports.updateCIF = async (req, res) => {
  try {
    const {
      title,
      category,
      severity,
      description,
      incidentDate,
      assignedTo,
      followUpDate,
      resolutionNotes
    } = req.body;

    const cif = await CIF.findOne({ _id: req.params.id, isArchived: false });

    if (!cif) {
      return res.status(404).json({ error: 'CIF record not found' });
    }

    // Check if can edit
    const editCheck = canEditCIF(cif, req.user.role);
    if (!editCheck.allowed) {
      return res.status(403).json({ error: editCheck.reason });
    }

    // Validate incident date if provided
    if (incidentDate && new Date(incidentDate) > new Date()) {
      return res.status(400).json({ error: 'Incident date cannot be in the future' });
    }

    // Store old values for audit
    const oldValues = {
      title: cif.title,
      category: cif.category,
      severity: cif.severity,
      assignedTo: cif.assignedTo
    };

    // Update fields
    if (title !== undefined) cif.title = title;
    if (category !== undefined) cif.category = category;
    if (severity !== undefined) cif.severity = severity;
    if (description !== undefined) cif.description = description;
    if (incidentDate !== undefined) cif.incidentDate = incidentDate;
    if (assignedTo !== undefined) cif.assignedTo = assignedTo;
    if (followUpDate !== undefined) cif.followUpDate = followUpDate;
    if (resolutionNotes !== undefined) cif.resolutionNotes = resolutionNotes;

    await cif.save();

    // Create audit log
    await createAuditLog(cif._id, 'update', req.user._id, oldValues, {
      title: cif.title,
      category: cif.category,
      severity: cif.severity,
      assignedTo: cif.assignedTo
    });

    const populated = await CIF.findById(cif._id)
      .populate('employeeId', 'fullName email employeeCode')
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email')
      .lean();

    res.json(populated);
  } catch (error) {
    console.error('Error updating CIF:', error);
    res.status(500).json({ error: 'Failed to update CIF record' });
  }
};

// Soft delete CIF
exports.deleteCIF = async (req, res) => {
  try {
    const cif = await CIF.findOne({ _id: req.params.id, isArchived: false });

    if (!cif) {
      return res.status(404).json({ error: 'CIF record not found' });
    }

    // Check if can delete
    const deleteCheck = canDeleteCIF(cif, req.user.role);
    if (!deleteCheck.allowed) {
      return res.status(403).json({ error: deleteCheck.reason });
    }

    cif.isArchived = true;
    await cif.save();

    // Create audit log
    await createAuditLog(cif._id, 'update', req.user._id, { isArchived: false }, { isArchived: true }, 'Record archived');

    res.json({ message: 'CIF record archived successfully' });
  } catch (error) {
    console.error('Error deleting CIF:', error);
    res.status(500).json({ error: 'Failed to delete CIF record' });
  }
};

// Get CIF statistics (for dashboard metrics)
exports.getCIFStats = async (req, res) => {
  try {
    const [total, openCases, highSeverity] = await Promise.all([
      CIF.countDocuments({ isArchived: false }),
      CIF.countDocuments({ isArchived: false, status: 'open' }),
      CIF.countDocuments({ isArchived: false, severity: { $in: ['high', 'critical'] } })
    ]);

    res.json({
      total,
      openCases,
      highSeverity
    });
  } catch (error) {
    console.error('Error fetching CIF stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
};

// Change CIF status (Phase 2)
exports.changeStatus = async (req, res) => {
  try {
    const { status, reason } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const cif = await CIF.findOne({ _id: req.params.id, isArchived: false });

    if (!cif) {
      return res.status(404).json({ error: 'CIF record not found' });
    }

    // Check if can edit
    const editCheck = canEditCIF(cif, req.user.role);
    if (!editCheck.allowed) {
      return res.status(403).json({ error: editCheck.reason });
    }

    // Validate transition
    if (!validateStatusTransition(cif.status, status)) {
      return res.status(400).json({
        error: `Invalid status transition from ${cif.status} to ${status}`
      });
    }

    // Require reason for escalation or closing
    if ((status === 'escalated' || status === 'closed') && !reason) {
      return res.status(400).json({
        error: `Reason is required when changing status to ${status}`
      });
    }

    // Resolution notes are recommended but not required for closing
    // (can be added during status change via reason field)
    if (status === 'closed' && !cif.resolutionNotes && !reason) {
      return res.status(400).json({
        error: 'Resolution notes or reason are required before closing the case'
      });
    }

    const oldStatus = cif.status;
    cif.status = status;
    await cif.save();

    // Create audit log
    await createAuditLog(
      cif._id,
      'status_change',
      req.user._id,
      { status: oldStatus },
      { status },
      reason
    );

    const populated = await CIF.findById(cif._id)
      .populate('employeeId', 'fullName email employeeCode')
      .populate('assignedTo', 'fullName email')
      .populate('createdBy', 'fullName email')
      .lean();

    res.json(populated);
  } catch (error) {
    console.error('Error changing status:', error);
    res.status(500).json({ error: 'Failed to change status' });
  }
};

// Get audit logs for a CIF (Phase 2)
exports.getAuditLogs = async (req, res) => {
  try {
    const logs = await CIFAudit.find({ cifId: req.params.id })
      .populate('performedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(logs);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

// Get employees with CIF records
exports.getEmployeesWithCIF = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    // Get all employees with CIF records
    const pipeline = [
      {
        $match: { isArchived: false }
      },
      {
        $group: {
          _id: '$employeeId',
          cifCount: { $sum: 1 },
          openCases: {
            $sum: {
              $cond: [
                { $in: ['$status', ['open', 'under_review', 'escalated']] },
                1,
                0
              ]
            }
          },
          highCount: {
            $sum: {
              $cond: [
                { $in: ['$severity', ['high', 'critical']] },
                1,
                0
              ]
            }
          },
          lastIncidentDate: { $max: '$incidentDate' }
        }
      }
    ];

    const cifData = await CIF.aggregate(pipeline);

    // Get employee IDs
    const employeeIds = cifData.map(item => item._id);

    // Build employee filter
    const employeeFilter = { _id: { $in: employeeIds } };
    if (search) {
      employeeFilter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { employeeCode: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    // Get employees with pagination
    const User = require('../../models/User');
    const [employees, total] = await Promise.all([
      User.find(employeeFilter)
        .select('fullName email employeeCode department')
        .sort({ fullName: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(employeeFilter)
    ]);

    // Merge CIF data with employee data
    const employeesWithCIF = employees.map(emp => {
      const cifInfo = cifData.find(c => c._id.toString() === emp._id.toString()) || {
        cifCount: 0,
        openCases: 0,
        highCount: 0,
        lastIncidentDate: null
      };

      // Calculate risk level
      let riskLevel = 'low';
      if (cifInfo.highCount > 0 && cifInfo.openCases > 0) {
        riskLevel = 'critical';
      } else if (cifInfo.highCount > 0) {
        riskLevel = 'high';
      } else if (cifInfo.cifCount >= 2) {
        riskLevel = 'medium';
      }

      return {
        ...emp,
        cifCount: cifInfo.cifCount,
        openCases: cifInfo.openCases,
        highCount: cifInfo.highCount,
        lastIncidentDate: cifInfo.lastIncidentDate,
        riskLevel
      };
    });

    res.json({
      employees: employeesWithCIF,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching employees with CIF:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

// Get single employee details
exports.getEmployeeDetails = async (req, res) => {
  try {
    const User = require('../../models/User');
    const employee = await User.findById(req.params.employeeId)
      .select('fullName email employeeCode department')
      .lean();

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    res.json(employee);
  } catch (error) {
    console.error('Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee details' });
  }
};

// Get CIF summary for employee (Phase 2)
exports.getEmployeeSummary = async (req, res) => {
  try {
    const employeeId = req.params.employeeId;

    const cases = await CIF.find({
      employeeId,
      isArchived: false
    }).select('severity status incidentDate').lean();

    const total = cases.length;
    const open = cases.filter(c => c.status === 'open' || c.status === 'under_review' || c.status === 'escalated').length;
    const highCount = cases.filter(c => c.severity === 'high' || c.severity === 'critical').length;

    const lastIncidentDate = cases.length > 0
      ? cases.reduce((latest, c) => {
          const date = new Date(c.incidentDate);
          return date > latest ? date : latest;
        }, new Date(0))
      : null;

    const riskLevel = await calculateRiskLevel(employeeId);

    res.json({
      total,
      open,
      highCount,
      lastIncidentDate,
      riskLevel
    });
  } catch (error) {
    console.error('Error fetching employee summary:', error);
    res.status(500).json({ error: 'Failed to fetch employee summary' });
  }
};



// ============ PHASE 3: ANALYTICS & ADVANCED FEATURES ============

// In-memory cache for analytics (60 seconds TTL)
let analyticsCache = {
  data: null,
  timestamp: 0,
  TTL: 60000 // 60 seconds
};

// Get CIF Analytics Dashboard Data
exports.getCIFAnalytics = async (req, res) => {
  try {
    const startTime = Date.now();

    // Check cache
    const now = Date.now();
    if (analyticsCache.data && (now - analyticsCache.timestamp) < analyticsCache.TTL) {
      return res.json(analyticsCache.data);
    }

    // Calculate date 6 months ago
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Run aggregations in parallel
    const [
      totalCIF,
      openCases,
      highSeverityCount,
      overdueFollowUps,
      monthlyTrend,
      severityDistribution,
      departmentDistribution
    ] = await Promise.all([
      // Total CIF count
      CIF.countDocuments({ isArchived: false }),

      // Open cases count
      CIF.countDocuments({ 
        isArchived: false, 
        status: { $in: ['open', 'under_review', 'escalated'] } 
      }),

      // High severity count
      CIF.countDocuments({ 
        isArchived: false, 
        severity: { $in: ['high', 'critical'] } 
      }),

      // Overdue follow-ups
      CIF.countDocuments({
        isArchived: false,
        followUpDate: { $lt: new Date() },
        status: { $nin: ['closed', 'resolved'] }
      }),

      // Monthly trend (last 6 months)
      CIF.aggregate([
        {
          $match: {
            isArchived: false,
            createdAt: { $gte: sixMonthsAgo }
          }
        },
        {
          $group: {
            _id: {
              year: { $year: '$createdAt' },
              month: { $month: '$createdAt' }
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { '_id.year': 1, '_id.month': 1 }
        }
      ]),

      // Severity distribution
      CIF.aggregate([
        {
          $match: { isArchived: false }
        },
        {
          $group: {
            _id: '$severity',
            count: { $sum: 1 }
          }
        }
      ]),

      // Department distribution (top 10)
      CIF.aggregate([
        {
          $match: { isArchived: false }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'employeeId',
            foreignField: '_id',
            as: 'employee'
          }
        },
        {
          $unwind: '$employee'
        },
        {
          $group: {
            _id: '$employee.department',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 10
        }
      ])
    ]);

    // Format monthly trend
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const formattedMonthlyTrend = monthlyTrend.map(item => ({
      month: `${monthNames[item._id.month - 1]} ${item._id.year}`,
      count: item.count
    }));

    // Format severity distribution
    const formattedSeverityDistribution = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0
    };
    severityDistribution.forEach(item => {
      formattedSeverityDistribution[item._id] = item.count;
    });

    // Format department distribution
    const formattedDepartmentDistribution = departmentDistribution.map(item => ({
      department: item._id || 'Unassigned',
      count: item.count
    }));

    const analyticsData = {
      totalCIF,
      openCases,
      highSeverityCount,
      overdueFollowUps,
      monthlyTrend: formattedMonthlyTrend,
      severityDistribution: formattedSeverityDistribution,
      departmentDistribution: formattedDepartmentDistribution
    };

    // Update cache
    analyticsCache = {
      data: analyticsData,
      timestamp: now,
      TTL: 60000
    };

    const responseTime = Date.now() - startTime;

    res.json(analyticsData);
  } catch (error) {
    console.error('Error fetching CIF analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics data' });
  }
};

// Get Risk Heatmap (Department Level)
exports.getRiskHeatmap = async (req, res) => {
  try {
    const startTime = Date.now();

    // Aggregate risk scores by department
    const heatmapData = await CIF.aggregate([
      {
        $match: { isArchived: false }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'employeeId',
          foreignField: '_id',
          as: 'employee'
        }
      },
      {
        $unwind: '$employee'
      },
      {
        $group: {
          _id: '$employee.department',
          criticalCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'critical'] }, 1, 0] }
          },
          highCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'high'] }, 1, 0] }
          },
          mediumCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'medium'] }, 1, 0] }
          },
          lowCount: {
            $sum: { $cond: [{ $eq: ['$severity', 'low'] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          department: '$_id',
          riskScore: {
            $add: [
              { $multiply: ['$criticalCount', 10] },
              { $multiply: ['$highCount', 5] },
              { $multiply: ['$mediumCount', 3] },
              { $multiply: ['$lowCount', 1] }
            ]
          },
          criticalCount: 1,
          highCount: 1,
          mediumCount: 1,
          lowCount: 1
        }
      },
      {
        $sort: { riskScore: -1 }
      }
    ]);

    // Calculate risk level based on score
    const formattedHeatmap = heatmapData.map(item => {
      let level = 'Low';
      if (item.riskScore >= 50) {
        level = 'Critical';
      } else if (item.riskScore >= 30) {
        level = 'High';
      } else if (item.riskScore >= 15) {
        level = 'Medium';
      }

      return {
        department: item.department || 'Unassigned',
        riskScore: item.riskScore,
        level,
        breakdown: {
          critical: item.criticalCount,
          high: item.highCount,
          medium: item.mediumCount,
          low: item.lowCount
        }
      };
    });

    const responseTime = Date.now() - startTime;

    res.json(formattedHeatmap);
  } catch (error) {
    console.error('Error fetching risk heatmap:', error);
    res.status(500).json({ error: 'Failed to fetch risk heatmap' });
  }
};

// Export CIF Records to CSV (Super Admin Only)
exports.exportCIF = async (req, res) => {
  try {
    const startTime = Date.now();

    // Build filter (same as getCIFList but without pagination)
    const filter = { 
      isArchived: req.query.includeArchived === 'true' ? { $in: [true, false] } : false 
    };

    // Apply same filters as list endpoint
    if (req.query.severity) {
      const severities = Array.isArray(req.query.severity) 
        ? req.query.severity 
        : req.query.severity.split(',');
      filter.severity = { $in: severities };
    }

    if (req.query.status) {
      const statuses = Array.isArray(req.query.status) 
        ? req.query.status 
        : req.query.status.split(',');
      filter.status = { $in: statuses };
    }

    if (req.query.category) {
      const categories = Array.isArray(req.query.category) 
        ? req.query.category 
        : req.query.category.split(',');
      filter.category = { $in: categories };
    }

    if (req.query.assignedTo) {
      filter.assignedTo = req.query.assignedTo;
    }

    if (req.query.dateFrom || req.query.dateTo) {
      filter.incidentDate = {};
      if (req.query.dateFrom) {
        filter.incidentDate.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        filter.incidentDate.$lte = new Date(req.query.dateTo);
      }
    }

    // Limit export to 5000 records
    const records = await CIF.find(filter)
      .populate('employeeId', 'fullName email employeeCode department')
      .populate('assignedTo', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    // Build CSV
    const csvHeaders = [
      'CIF ID',
      'Employee Name',
      'Employee Code',
      'Department',
      'Title',
      'Category',
      'Severity',
      'Status',
      'Incident Date',
      'Assigned To',
      'Follow-up Date',
      'Created Date'
    ];

    let csvContent = csvHeaders.join(',') + '\n';

    records.forEach(record => {
      const row = [
        record.cifId || '',
        record.employeeId?.fullName || '',
        record.employeeId?.employeeCode || '',
        record.employeeId?.department || '',
        `"${(record.title || '').replace(/"/g, '""')}"`, // Escape quotes
        record.category || '',
        record.severity || '',
        record.status || '',
        record.incidentDate ? new Date(record.incidentDate).toISOString().split('T')[0] : '',
        record.assignedTo?.fullName || '',
        record.followUpDate ? new Date(record.followUpDate).toISOString().split('T')[0] : '',
        record.createdAt ? new Date(record.createdAt).toISOString().split('T')[0] : ''
      ];
      csvContent += row.join(',') + '\n';
    });

    const responseTime = Date.now() - startTime;

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="cif-export-${Date.now()}.csv"`);
    res.send(csvContent);
  } catch (error) {
    console.error('Error exporting CIF records:', error);
    res.status(500).json({ error: 'Failed to export CIF records' });
  }
};

// Archive old records (can be called manually or via cron)
exports.archiveOldRecords = async (req, res) => {
  try {
    // Archive records older than 2 years that are closed
    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const result = await CIF.updateMany(
      {
        isArchived: false,
        status: 'closed',
        createdAt: { $lt: twoYearsAgo }
      },
      {
        $set: { isArchived: true }
      }
    );

    console.log(`Archived ${result.modifiedCount} old CIF records`);

    res.json({
      message: 'Archival completed',
      archivedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error archiving old records:', error);
    res.status(500).json({ error: 'Failed to archive old records' });
  }
};

// ============ CIF ATTACHMENTS ============

const CIFAttachment = require('./cifAttachment.model');
const NewNotificationService = require('../../services/NewNotificationService');
const { getBucket } = require('../../middleware/uploadCIFAttachmentGridFS');

// Upload attachments to CIF
exports.uploadAttachments = async (req, res) => {
  try {
    console.log('Upload attachments request:', {
      cifId: req.params.cifId,
      filesCount: req.files?.length,
      user: req.user
    });

    const { cifId } = req.params;
    const files = req.files; // Set by uploadCIFAttachmentGridFS middleware

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    // Verify CIF exists
    const cif = await CIF.findOne({ _id: cifId, isArchived: false });
    if (!cif) {
      // Clean up uploaded GridFS files
      const bucket = getBucket();
      for (const file of files) {
        try {
          await bucket.delete(file.fileId);
        } catch (err) {
          console.error('Error deleting GridFS file:', err);
        }
      }
      return res.status(404).json({ error: 'CIF record not found' });
    }

    console.log('Creating attachment records for user:', req.user);

    // Get user ID (handle both userId and _id formats)
    const uploaderId = req.user._id || req.user.userId;
    if (!uploaderId) {
      console.error('No user ID found in req.user:', req.user);
      return res.status(401).json({ error: 'User ID not found' });
    }

    // Create attachment records
    const attachments = await Promise.all(
      files.map(file => 
        CIFAttachment.create({
          cifId,
          fileId: file.fileId,
          fileName: file.filename,
          originalName: file.originalName,
          fileType: file.mimetype,
          fileSize: file.size,
          uploadedBy: uploaderId
        })
      )
    );

    console.log('Attachments created:', attachments.length);

    // Populate uploader info
    const populatedAttachments = await CIFAttachment.find({
      _id: { $in: attachments.map(a => a._id) }
    }).populate('uploadedBy', 'fullName email').lean();

    // Create audit log
    await createAuditLog(
      cifId,
      'attachment_upload',
      uploaderId,
      null,
      { fileCount: files.length, files: files.map(f => f.originalName) }
    );

    // Trigger notification to assigned HR
    if (cif.assignedTo) {
      const assignedUser = await require('../../models/User').findById(cif.assignedTo).select('fullName').lean();
      if (assignedUser) {
        await NewNotificationService.createAndEmitNotification({
          message: `New attachment(s) uploaded to CIF ${cif.cifId}`,
          userId: cif.assignedTo,
          userName: assignedUser.fullName,
          type: 'cif_attachment_added',
          recipientType: 'user',
          category: 'admin',
          priority: 'medium',
          navigationData: {
            page: 'admin/cif',
            params: { cifId: cif._id }
          },
          metadata: {
            type: 'CIF_ATTACHMENT_ADDED',
            cifId: cif._id,
            cifNumber: cif.cifId,
            fileCount: files.length,
            uploadedBy: req.user?.fullName || 'Unknown'
          }
        });
      }
    }

    res.status(201).json(populatedAttachments);
  } catch (error) {
    console.error('Error uploading attachments:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to upload attachments',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get attachments for a CIF
exports.getAttachments = async (req, res) => {
  try {
    const { cifId } = req.params;

    // Verify CIF exists
    const cif = await CIF.findOne({ _id: cifId, isArchived: false });
    if (!cif) {
      return res.status(404).json({ error: 'CIF record not found' });
    }

    const attachments = await CIFAttachment.find({ cifId })
      .populate('uploadedBy', 'fullName email')
      .sort({ createdAt: -1 })
      .lean();

    res.json(attachments);
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({ error: 'Failed to fetch attachments' });
  }
};

// Download attachment
exports.downloadAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;

    const attachment = await CIFAttachment.findById(attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const bucket = getBucket();
    
    // Set response headers
    res.set('Content-Type', attachment.fileType);
    res.set('Content-Disposition', `attachment; filename="${attachment.originalName}"`);
    
    // Stream file from GridFS
    const downloadStream = bucket.openDownloadStream(attachment.fileId);
    
    downloadStream.on('error', (error) => {
      console.error('Error streaming file from GridFS:', error);
      if (!res.headersSent) {
        res.status(404).json({ error: 'File not found in storage' });
      }
    });
    
    downloadStream.pipe(res);
  } catch (error) {
    console.error('Error downloading attachment:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to download attachment' });
    }
  }
};

// Delete attachment
exports.deleteAttachment = async (req, res) => {
  try {
    const { attachmentId } = req.params;

    const attachment = await CIFAttachment.findById(attachmentId);
    if (!attachment) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    // Verify CIF exists and check permissions
    const cif = await CIF.findOne({ _id: attachment.cifId, isArchived: false });
    if (!cif) {
      return res.status(404).json({ error: 'CIF record not found' });
    }

    // Check if can edit (same rules as CIF editing)
    const editCheck = canEditCIF(cif, req.user.role);
    if (!editCheck.allowed) {
      return res.status(403).json({ error: editCheck.reason });
    }

    // Delete file from GridFS
    const bucket = getBucket();
    try {
      await bucket.delete(attachment.fileId);
      console.log('Deleted file from GridFS:', attachment.fileId);
    } catch (err) {
      console.error('Error deleting file from GridFS:', err);
      // Continue anyway - file might already be deleted
    }

    // Delete from database
    await CIFAttachment.deleteOne({ _id: attachmentId });

    // Create audit log
    await createAuditLog(
      attachment.cifId,
      'attachment_delete',
      req.user._id,
      { fileName: attachment.originalName },
      null
    );

    res.json({ message: 'Attachment deleted successfully' });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  }
};
