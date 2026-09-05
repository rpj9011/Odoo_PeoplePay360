// backend/routes/users.js

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const authenticateToken = require('../middleware/authenticateToken');
const uploadAvatarGridFS = require('../middleware/uploadAvatarGridFS'); // NEW: Secure GridFS upload
const cacheService = require('../services/cacheService');

// @route   GET /api/users/profile
// @desc    Get the current user's profile
// @access  Private
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .populate('shiftGroup', 'shiftName startTime endTime durationHours paidBreakMinutes')
            .populate('reportingPerson', 'fullName email department')
            .lean();
        
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Normalize reportingPerson to null if not populated
        if (!user.reportingPerson || typeof user.reportingPerson !== 'object') {
            user.reportingPerson = null;
        }

        // Return user profile data
        res.json({
            _id: user._id,
            fullName: user.fullName,
            employeeCode: user.employeeCode,
            email: user.email,
            role: user.role,
            designation: user.designation,
            department: user.department,
            joiningDate: user.joiningDate,
            profileImageUrl: user.profileImageUrl,
            personalDetails: user.personalDetails || {},
            identityDetails: user.identityDetails || {},
            reportingPerson: user.reportingPerson || {},
            shiftGroup: user.shiftGroup
        });
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch profile.' });
    }
});

// @route   PUT /api/user/update-profile
// @desc    Update the current user's profile
// @access  Private
router.put('/update-profile', authenticateToken, async (req, res) => {
    try {
        const { personalDetails, identityDetails } = req.body;
        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Update personal details
        if (personalDetails) {
            user.personalDetails = {
                ...user.personalDetails,
                ...personalDetails
            };
            // personalDetails is a Mixed/Object type — Mongoose won't detect the
            // mutation from the spread unless we explicitly mark it modified.
            user.markModified('personalDetails');
        }

        // Update identity details
        if (identityDetails) {
            user.identityDetails = {
                ...user.identityDetails,
                ...identityDetails
            };
            // Same reason as above.
            user.markModified('identityDetails');
        }

        await user.save();

        // Bust the /auth/me cache so the next request returns fresh data.
        // Without this the 5-min NodeCache TTL serves the old personalDetails
        // even though MongoDB has the new values.
        cacheService.invalidateUser(req.user.userId);

        // Return updated user
        const updatedUser = await User.findById(req.user.userId)
            .populate('shiftGroup', 'shiftName startTime endTime durationHours paidBreakMinutes')
            .populate('reportingPerson', 'fullName email department')
            .lean();
        
        // Normalize reportingPerson to null if not populated
        if (!updatedUser.reportingPerson || typeof updatedUser.reportingPerson !== 'object') {
            updatedUser.reportingPerson = null;
        }

        res.json({
            message: 'Profile updated successfully.',
            user: {
                _id: updatedUser._id,
                fullName: updatedUser.fullName,
                employeeCode: updatedUser.employeeCode,
                email: updatedUser.email,
                role: updatedUser.role,
                designation: updatedUser.designation,
                department: updatedUser.department,
                joiningDate: updatedUser.joiningDate,
                profileImageUrl: updatedUser.profileImageUrl,
                personalDetails: updatedUser.personalDetails || {},
                identityDetails: updatedUser.identityDetails || {},
                reportingPerson: updatedUser.reportingPerson || {},
                shiftGroup: updatedUser.shiftGroup
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Failed to update profile.' });
    }
});

// @route   GET /api/users/avatar/:id
// @desc    Get avatar image by GridFS ObjectId (serves from MongoDB GridFS)
// @access  Public (no auth required for images)
router.get('/avatar/:id', async (req, res) => {
    try {
        const mongoose = require('mongoose');
        const { ObjectId } = require('mongodb');
        
        // Extract ObjectId from parameter (handle query params like ?v=timestamp)
        // Remove file extension if present (e.g., "id.jpg" -> "id")
        let avatarId = req.params.id;
        if (avatarId.includes('.')) {
            avatarId = avatarId.split('.')[0];
        }
        
        console.log(`[Avatar GET] Requested avatar ID: ${avatarId}`);
        
        // Validate ObjectId format
        if (!ObjectId.isValid(avatarId)) {
            console.log(`[Avatar GET] Invalid ObjectId format: ${avatarId}`);
            return res.status(400).json({ error: 'Invalid avatar ID format' });
        }
        
        const objectId = new ObjectId(avatarId);
        console.log(`[Avatar GET] Converted to ObjectId: ${objectId}`);
        
        // Get GridFS bucket
        const db = mongoose.connection.db;
        if (!db) {
            console.error('[Avatar GET] MongoDB connection not available');
            return res.status(503).json({ error: 'Database connection unavailable' });
        }
        
        const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'avatars' });
        
        // Find file in GridFS
        const files = await bucket.find({ _id: objectId }).toArray();
        
        if (!files || files.length === 0) {
            console.log(`[Avatar GET] File not found in GridFS for ID: ${avatarId}`);
            return res.status(404).json({ error: 'Avatar image not found' });
        }
        
        const file = files[0];
        console.log(`[Avatar GET] File found in GridFS:`, {
            id: file._id,
            filename: file.filename,
            contentType: file.contentType,
            length: file.length
        });
        
        // Determine content type from GridFS metadata or file extension
        let contentType = file.contentType || 'image/jpeg';
        if (!contentType.startsWith('image/')) {
            // Fallback: determine from filename
            const ext = file.filename ? file.filename.split('.').pop().toLowerCase() : '';
            const contentTypes = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'webp': 'image/webp'
            };
            contentType = contentTypes[ext] || 'image/jpeg';
        }
        
        // Set proper headers BEFORE streaming
        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=31536000, immutable'); // Cache for 1 year, immutable
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Length', file.length);
        
        console.log(`[Avatar GET] Streaming file with Content-Type: ${contentType}`);
        
        // Stream file from GridFS
        const downloadStream = bucket.openDownloadStream(objectId);
        
        // Handle stream errors
        downloadStream.on('error', (error) => {
            console.error('[Avatar GET] GridFS stream error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to stream avatar image' });
            }
        });
        
        // Pipe GridFS stream to response
        downloadStream.pipe(res);
        
    } catch (error) {
        console.error('[Avatar GET] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to serve avatar image' });
        }
    }
});

// @route   POST /api/users/upload-avatar
// @desc    Upload or update a profile picture for the logged-in user (GridFS ONLY)
// @access  Private
// @security Rate limited (5 uploads/hour), image validation, compression, EXIF stripping
router.post(
    '/upload-avatar',
    authenticateToken, // 1. Authenticate user
    uploadAvatarGridFS, // 2. Process & upload to GridFS (replaces old filesystem upload)
    async (req, res) => {
        try {
            // uploadAvatarGridFS middleware attaches req.avatarUpload with GridFS file info
            if (!req.avatarUpload || !req.avatarUpload.fileId) {
                return res.status(500).json({ error: 'Avatar upload processing failed.' });
            }

            const user = await User.findById(req.user.userId);
            if (!user) {
                return res.status(404).json({ error: 'User not found.' });
            }

            // Store GridFS ObjectId as profileImageUrl
            // Format: /api/users/avatar/{objectId}
            const imageUrl = `/api/users/avatar/${req.avatarUpload.fileId}`;
            
            user.profileImageUrl = imageUrl;
            await user.save();

            // CRITICAL FIX: Invalidate user cache so /auth/me returns fresh data immediately
            // Without this, the cached user object (5-min TTL) is served with the OLD profileImageUrl
            cacheService.invalidateUser(req.user.userId);

            // Emit socket event so other open pages (Topbar, admin views) update in real time
            try {
                const { getIO } = require('../socketManager');
                const io = getIO();
                if (io) {
                    io.emit('user_profile_updated', {
                        userId: user._id,
                        employeeCode: user.employeeCode,
                        fullName: user.fullName,
                        field: 'profileImageUrl',
                        newValue: imageUrl,
                        updatedBy: req.user.userId,
                        timestamp: new Date().toISOString(),
                        message: 'Profile image updated'
                    });
                }
            } catch (socketErr) {
                console.warn('[Avatar Upload] Could not emit socket event:', socketErr.message);
            }

            console.log('[Avatar Upload] Success:', {
                userId: req.user.userId,
                fileId: req.avatarUpload.fileId,
                size: req.avatarUpload.size
            });

            res.json({
                message: 'Profile image uploaded successfully.',
                imageUrl: user.profileImageUrl,
                metadata: {
                    size: req.avatarUpload.size,
                    format: 'webp',
                    compressed: true
                }
            });

        } catch (error) {
            console.error('[Avatar Upload] Route error:', error);
            res.status(500).json({ 
                error: 'Server error while uploading image.',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    }
);

// @route   DELETE /api/users/remove-avatar
// @desc    Remove the current user's profile picture (clears URL in DB + GridFS file)
// @access  Private
router.delete('/remove-avatar', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        // Delete the file from GridFS if it exists
        if (user.profileImageUrl) {
            try {
                const oldIdMatch = user.profileImageUrl.match(/\/avatar\/([a-f0-9]{24})/i);
                if (oldIdMatch) {
                    const { getAvatarBucket } = require('../db');
                    const avatarBucket = getAvatarBucket();
                    await avatarBucket.delete(new mongoose.Types.ObjectId(oldIdMatch[1]));
                    console.log('[Avatar Remove] Deleted GridFS file:', oldIdMatch[1]);
                }
            } catch (e) {
                console.warn('[Avatar Remove] Could not delete GridFS file:', e.message);
            }
        }

        user.profileImageUrl = '';
        await user.save();

        // Invalidate user cache so /auth/me immediately returns the cleared URL
        cacheService.invalidateUser(req.user.userId);

        // Notify other open sessions via socket
        try {
            const { getIO } = require('../socketManager');
            const io = getIO();
            if (io) {
                io.emit('user_profile_updated', {
                    userId: user._id,
                    field: 'profileImageUrl',
                    newValue: '',
                    updatedBy: req.user.userId,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (socketErr) {
            console.warn('[Avatar Remove] Could not emit socket event:', socketErr.message);
        }

        res.json({ message: 'Profile image removed successfully.' });

    } catch (error) {
        console.error('[Avatar Remove] Error:', error);
        res.status(500).json({ error: 'Failed to remove profile image.' });
    }
});

module.exports = router;