// backend/routes/resourceRequests.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const requireResourceRequestAccess = require('../middleware/requireResourceRequestAccess');
const EmployeeResourceRequest = require('../models/EmployeeResourceRequest');
const { CATEGORIES, STATUSES } = require('../models/EmployeeResourceRequest');
const User = require('../models/User');
const NewNotificationService = require('../services/NewNotificationService');

const formatCategoryLabel = (req) => {
    if (req.category === 'Other' && req.customCategory) {
        return req.customCategory;
    }
    return req.category;
};

const userCanManageResourceRequests = async (req) => {
    if (req.user.role === 'Admin') return true;
    const dbUser = await User.findById(req.user.userId)
        .select('featurePermissions isActive')
        .lean();
    return Boolean(
        dbUser?.isActive !== false
        && dbUser?.featurePermissions?.canManageResourceRequests === true
    );
};

const attachProfileImages = async (requests) => {
    if (!requests?.length) return requests;
    const userIds = [...new Set(requests.map((r) => r.userId?.toString()).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } })
        .select('_id profileImageUrl')
        .lean();
    const imageByUserId = new Map(users.map((u) => [u._id.toString(), u.profileImageUrl || '']));
    return requests.map((request) => ({
        ...request,
        profileImageUrl: imageByUserId.get(request.userId?.toString()) || '',
    }));
};

const attachProfileImage = async (request) => {
    if (!request?.userId) return { ...request, profileImageUrl: '' };
    const user = await User.findById(request.userId).select('profileImageUrl').lean();
    return {
        ...request,
        profileImageUrl: user?.profileImageUrl || '',
    };
};

// POST /api/resource-requests — employee submits a request
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { category, customCategory, title, description, quantity, priority } = req.body;

        if (!category || !CATEGORIES.includes(category)) {
            return res.status(400).json({ error: `Category is required. Valid: ${CATEGORIES.join(', ')}` });
        }
        if (category === 'Other' && (!customCategory || !String(customCategory).trim())) {
            return res.status(400).json({ error: 'Please specify the request type when category is Other.' });
        }
        if (!title || !String(title).trim()) {
            return res.status(400).json({ error: 'Title is required.' });
        }
        if (!description || !String(description).trim()) {
            return res.status(400).json({ error: 'Description is required.' });
        }

        const employee = await User.findById(req.user.userId).select('fullName employeeCode department').lean();
        if (!employee) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const newRequest = await EmployeeResourceRequest.create({
            userId: req.user.userId,
            employeeName: employee.fullName,
            employeeCode: employee.employeeCode,
            department: employee.department,
            category,
            customCategory: category === 'Other' ? String(customCategory).trim() : undefined,
            title: String(title).trim(),
            description: String(description).trim(),
            quantity: Math.min(999, Math.max(1, parseInt(quantity, 10) || 1)),
            priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
            status: 'Pending',
        });

        const categoryLabel = formatCategoryLabel(newRequest);
        await NewNotificationService.broadcastToResourceRequestManagers({
            message: `${employee.fullName} requested ${categoryLabel}: "${newRequest.title}"`,
            type: 'resource_request',
            category: 'request',
            priority: newRequest.priority === 'high' ? 'high' : 'medium',
            navigationData: {
                page: '/resource-requests/manage',
                params: { requestId: newRequest._id.toString() },
            },
            metadata: {
                requestId: newRequest._id.toString(),
                category: categoryLabel,
                title: newRequest.title,
            },
        }, req.user.userId);

        res.status(201).json({ message: 'Request submitted successfully.', request: newRequest });
    } catch (error) {
        console.error('Error creating resource request:', error);
        res.status(500).json({ error: 'Failed to submit request.' });
    }
});

// GET /api/resource-requests/mine — employee's own requests
router.get('/mine', authenticateToken, async (req, res) => {
    try {
        const requests = await EmployeeResourceRequest.find({ userId: req.user.userId })
            .sort({ createdAt: -1 })
            .limit(100)
            .lean();
        res.json({ requests, categories: CATEGORIES, statuses: STATUSES });
    } catch (error) {
        console.error('Error fetching user resource requests:', error);
        res.status(500).json({ error: 'Failed to fetch your requests.' });
    }
});

// GET /api/resource-requests — admin / delegated manager list
router.get('/', [authenticateToken, requireResourceRequestAccess], async (req, res) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = Math.min(parseInt(req.query.limit, 10) || 25, 100);
        const skip = (page - 1) * limit;
        const query = {};

        if (req.query.status && STATUSES.includes(req.query.status)) {
            query.status = req.query.status;
        }
        if (req.query.category && CATEGORIES.includes(req.query.category)) {
            query.category = req.query.category;
        }
        if (req.query.search) {
            const searchRegex = new RegExp(req.query.search, 'i');
            query.$or = [
                { title: searchRegex },
                { description: searchRegex },
                { employeeName: searchRegex },
                { employeeCode: searchRegex },
            ];
        }

        const [requests, totalCount] = await Promise.all([
            EmployeeResourceRequest.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            EmployeeResourceRequest.countDocuments(query),
        ]);

        const requestsWithProfiles = await attachProfileImages(requests);

        res.json({
            requests: requestsWithProfiles,
            totalCount,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit),
            categories: CATEGORIES,
            statuses: STATUSES,
        });
    } catch (error) {
        console.error('Error fetching resource requests:', error);
        res.status(500).json({ error: 'Failed to fetch requests.' });
    }
});

// GET /api/resource-requests/:id
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const request = await EmployeeResourceRequest.findById(req.params.id).lean();
        if (!request) {
            return res.status(404).json({ error: 'Request not found.' });
        }

        const isOwner = request.userId.toString() === req.user.userId;
        const canManage = await userCanManageResourceRequests(req);
        if (!isOwner && !canManage) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const requestWithProfile = await attachProfileImage(request);
        res.json({ request: requestWithProfile });
    } catch (error) {
        console.error('Error fetching resource request:', error);
        res.status(500).json({ error: 'Failed to fetch request.' });
    }
});

// PATCH /api/resource-requests/:id/status — admin / delegated manager updates status
router.patch('/:id/status', [authenticateToken, requireResourceRequestAccess], async (req, res) => {
    try {
        const { status, adminNotes } = req.body;
        if (!status || !STATUSES.includes(status)) {
            return res.status(400).json({ error: `Invalid status. Valid: ${STATUSES.join(', ')}` });
        }
        if (status === 'Cancelled') {
            return res.status(400).json({ error: 'Use cancel endpoint for cancellation.' });
        }

        const request = await EmployeeResourceRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ error: 'Request not found.' });
        }

        const admin = await User.findById(req.user.userId).select('fullName').lean();
        request.status = status;
        if (adminNotes !== undefined) {
            request.adminNotes = String(adminNotes).trim().slice(0, 1000);
        }
        request.reviewedBy = req.user.userId;
        request.reviewedByName = admin?.fullName || 'Admin';
        request.reviewedAt = new Date();
        await request.save();

        const categoryLabel = formatCategoryLabel(request);
        const statusMessages = {
            'In Progress': `Your ${categoryLabel} request "${request.title}" is now in progress.`,
            Fulfilled: `Your ${categoryLabel} request "${request.title}" has been fulfilled.`,
            Rejected: `Your ${categoryLabel} request "${request.title}" was rejected.`,
        };

        if (statusMessages[status]) {
            await NewNotificationService.createAndEmitNotification({
                userId: request.userId,
                userName: request.employeeName,
                message: statusMessages[status],
                type: 'resource_request_status',
                category: 'request',
                priority: status === 'Rejected' ? 'high' : 'medium',
                recipientType: 'user',
                navigationData: { page: '/requests', params: { requestId: request._id.toString() } },
                metadata: { requestId: request._id.toString(), status },
            });
        }

        res.json({ message: 'Request updated.', request });
    } catch (error) {
        console.error('Error updating resource request status:', error);
        res.status(500).json({ error: 'Failed to update request.' });
    }
});

// PATCH /api/resource-requests/:id/cancel — employee cancels pending request
router.patch('/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const request = await EmployeeResourceRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ error: 'Request not found.' });
        }
        if (request.userId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (request.status !== 'Pending') {
            return res.status(400).json({ error: 'Only pending requests can be cancelled.' });
        }

        request.status = 'Cancelled';
        await request.save();

        res.json({ message: 'Request cancelled.', request });
    } catch (error) {
        console.error('Error cancelling resource request:', error);
        res.status(500).json({ error: 'Failed to cancel request.' });
    }
});

module.exports = router;
